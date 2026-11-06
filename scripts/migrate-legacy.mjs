import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeLayout } from "./layout.mjs";

export function relocateText(text, mappings) {
  for (const [from, to] of mappings) {
    const variants = [
      [JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1)],
      [from.replaceAll("\\", "/"), to.replaceAll("\\", "/")],
      [from, to],
    ];
    for (const [oldPath, newPath] of variants) {
      if (/^[a-z]:[\\/]/i.test(from)) {
        const pattern = new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        text = text.replace(pattern, (match) => match === match.toLowerCase() ? newPath.toLowerCase() : newPath);
      } else text = text.replaceAll(oldPath, newPath);
    }
  }
  return text;
}

export function migrateLegacy(source, deploymentRoot) {
  source = resolve(source);
  deploymentRoot = resolve(deploymentRoot);
  if (deploymentRoot === source || deploymentRoot.startsWith(source + "/") || deploymentRoot.startsWith(source + "\\"))
    throw new Error("部署目录必须位于源码目录之外");
  const oldState = join(source, ".local-state");
  const oldTools = join(source, ".local-tools");
  const state = join(deploymentRoot, "state");
  const tools = join(deploymentRoot, "tools");
  if (!existsSync(oldState)) throw new Error("没有找到旧版运行目录");
  if (existsSync(state)) throw new Error("目标 state 已存在，迁移已停止以便检查现有数据");
  const database = join(oldState, "workbench/workbench.sqlite");
  const before = new DatabaseSync(database);
  try {
    const running = before.prepare("SELECT count(*) AS n FROM runs WHERE status IN ('queued','starting','running','waiting_input','finalizing')").get().n;
    const candidates = before.prepare("SELECT count(*) AS n FROM candidate_jobs WHERE json_extract(data,'$.status') IN ('queued','starting','running','waiting_input','finalizing')").get().n;
    if (running || candidates) throw new Error("请先停止研究并等待候选生成完成，再迁移");
    before.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { before.close(); }
  mkdirSync(deploymentRoot, { recursive: true });
  const staging = join(deploymentRoot, `state.migrating-${Date.now()}`);
  cpSync(oldState, staging, { recursive: true });
  const mappings = [[oldState, state], [oldTools, tools]];
  function rewriteFiles(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (path === join(staging, "cliproxyapi/auth")) continue;
      if (path === join(staging, "workbench/workspaces") || name === "deliverables" || name === "materials") continue;
      const info = lstatSync(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) rewriteFiles(path);
      else if (/\.(json|jsonl|jsonc|yaml|yml)$/i.test(name)) {
        const text = readFileSync(path, "utf8");
        const relocated = relocateText(text, mappings);
        if (text !== relocated) writeFileSync(path, relocated);
      }
    }
  }
  rewriteFiles(staging);
  const migrated = new DatabaseSync(join(staging, "workbench/workbench.sqlite"));
  try {
    migrated.exec("BEGIN IMMEDIATE");
    for (const table of ["settings", "tags", "preferences", "topics", "templates", "tasks", "runs", "folders", "artifacts", "candidate_jobs"]) {
      for (const row of migrated.prepare(`SELECT rowid,data FROM ${table}`).all()) {
        const value = relocateText(row.data, mappings);
        if (value !== row.data) migrated.prepare(`UPDATE ${table} SET data=? WHERE rowid=?`).run(value, row.rowid);
      }
    }
    migrated.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE)");
    if (migrated.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("迁移数据库校验失败");
  } finally { migrated.close(); }
  function mergeTools(from, to) {
    if (!existsSync(to)) {
      cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
      return;
    }
    const info = lstatSync(from);
    const targetInfo = lstatSync(to);
    if (info.isDirectory() && targetInfo.isDirectory()) {
      for (const name of readdirSync(from)) mergeTools(join(from, name), join(to, name));
    } else if (info.isSymbolicLink() && targetInfo.isSymbolicLink()) {
      if (readlinkSync(from) !== readlinkSync(to)) throw new Error("现有工具链接与旧版工具冲突");
    } else if (!info.isFile() || !targetInfo.isFile() || !readFileSync(from).equals(readFileSync(to))) {
      throw new Error("现有部署工具与旧版工具冲突，请核对 tools 目录");
    }
  }
  if (existsSync(oldTools)) mergeTools(oldTools, tools);
  renameSync(staging, state);
  const backup = join(deploymentRoot, "backups", `legacy-${Date.now()}`);
  mkdirSync(backup, { recursive: true });
  function backupTree(from, name) {
    if (from !== oldState && from !== oldTools) throw new Error("迁移源目录无效");
    const target = join(backup, name);
    try { renameSync(from, target); }
    catch (error) {
      if (error.code !== "EXDEV") throw error;
      cpSync(from, target, { recursive: true, errorOnExist: true, force: false });
      mergeTools(from, target);
      rmSync(from, { recursive: true });
    }
  }
  backupTree(oldState, "state");
  if (existsSync(oldTools)) backupTree(oldTools, "tools");
  return { state, tools, backup };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const port of [process.env.PORT || 8765, 8317]) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      throw new Error("请先停止网页服务和订阅转接服务，再执行迁移");
    } catch (error) {
      if (error.message.includes("请先停止")) throw error;
    }
  }
  const result = migrateLegacy(source, runtimeLayout(source).deploymentRoot);
  console.log(`运行数据已迁移至 ${result.state}，原数据备份至 ${result.backup}`);
}
