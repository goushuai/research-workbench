import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runtimeLayout, runtimeEnvironment } from "./layout.mjs";
import { COPILOT_VERSION, PROXY_VERSION, installationTarget, verifyDownload } from "./install-support.mjs";

const { values } = parseArgs({ options: { "deploy-dir": { type: "string" }, "no-start": { type: "boolean" } } });
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layout = runtimeLayout(source, { ...process.env, ...(values["deploy-dir"] ? { WORKBENCH_DEPLOY_DIR: values["deploy-dir"] } : {}) });
const sourceRelative = relative(source, layout.deploymentRoot);
if (!sourceRelative || (!isAbsolute(sourceRelative) && sourceRelative !== ".." && !sourceRelative.startsWith(".." + sep)))
  throw new Error("部署目录必须位于源码目录之外");
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("需要 Node.js 24 或更新版本");
const target = installationTarget(process.platform, process.arch);
const env = runtimeEnvironment(layout);
try {
  const response = await fetch(`http://127.0.0.1:${env.PORT || 8765}/api/state`, { signal: AbortSignal.timeout(1000) });
  if (response.ok) throw new Error("请先停止工作台网页服务，再安装或更新部署");
} catch (error) {
  if (error.message.includes("请先停止")) throw error;
}
if (existsSync(join(source, ".local-state/workbench/workbench.sqlite")))
  throw new Error("发现旧版运行数据，请先停止服务并执行 node scripts/migrate-legacy.mjs");

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} 执行失败，退出码 ${result.status}`);
}
const nodeDirectory = dirname(process.execPath);
const npmCli = [
  env.NPM_CLI_PATH,
  join(nodeDirectory, "node_modules/npm/bin/npm-cli.js"),
  join(nodeDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
].find((path) => path && existsSync(path));
if (!npmCli && process.platform === "win32") throw new Error("找不到 npm，请安装完整 Node.js 或设置 NPM_CLI_PATH");
const npm = (args, cwd) => npmCli
  ? run(process.execPath, [npmCli, ...args], cwd)
  : run("npm", args, cwd);

mkdirSync(layout.deploymentRoot, { recursive: true });
const staging = join(layout.deploymentRoot, `app.staging-${randomUUID()}`);
mkdirSync(staging);
for (const entry of ["src", "scripts", "config", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html", "task.yaml", "README.md"])
  cpSync(join(source, entry), join(staging, entry), { recursive: true });
console.log("正在安装应用依赖并构建独立部署…");
npm(["ci", "--include=dev", "--include=optional", "--no-audit", "--no-fund"], staging);
npm(["run", "build"], staging);
const pdfBrowsers = [
  env.PDF_BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
if (!pdfBrowsers.some((path) => path && existsSync(path)))
  run(process.execPath, [join(staging, "node_modules/playwright-core/cli.js"), "install", "chromium"], staging);
const copilotDirectory = join(layout.toolsRoot, "copilot");
mkdirSync(copilotDirectory, { recursive: true });
const copilotPackage = join(copilotDirectory, "node_modules/@github/copilot/package.json");
const copilotBinary = join(copilotDirectory, `node_modules/@github/copilot-${process.platform}-${process.arch}/copilot${process.platform === "win32" ? ".exe" : ""}`);
if (!existsSync(copilotPackage) || !existsSync(copilotBinary) || JSON.parse(readFileSync(copilotPackage, "utf8")).version !== COPILOT_VERSION)
  npm(["install", `@github/copilot@${COPILOT_VERSION}`, "--include=optional", "--no-audit", "--no-fund"], copilotDirectory);
if (!existsSync(copilotBinary)) throw new Error("Copilot 平台组件缺失，请检查 npm 的 optionalDependencies 安装设置");

const proxyDirectory = join(layout.toolsRoot, "cliproxyapi", PROXY_VERSION);
if (!existsSync(join(proxyDirectory, target.executable))) {
  console.log(`正在下载 ${target.file}…`);
  const response = await fetch(target.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`下载官方 CLIProxyAPI 失败，HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  verifyDownload(buffer, target.digest);
  const archive = join(layout.temporaryRoot, target.file);
  writeFileSync(archive, buffer);
  mkdirSync(proxyDirectory, { recursive: true });
  if (process.platform === "win32")
    run("tar.exe", ["-xf", archive, "-C", proxyDirectory], layout.deploymentRoot);
  else run("tar", ["-xzf", archive, "-C", proxyDirectory], layout.deploymentRoot);
}
if (!existsSync(join(proxyDirectory, target.executable))) throw new Error("发行包缺少 CLIProxyAPI 可执行文件");
mkdirSync(join(layout.proxyRoot, "auth"), { recursive: true, mode: 0o700 });
const proxyConfig = join(layout.proxyRoot, "config.yaml");
if (!existsSync(proxyConfig)) {
  const networkProxy = env.WORKBENCH_NETWORK_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || "";
  writeFileSync(proxyConfig, [
    'host: "127.0.0.1"', "port: 8317",
    `auth-dir: ${JSON.stringify(join(layout.proxyRoot, "auth"))}`,
    "api-keys:", `  - ${JSON.stringify(randomBytes(32).toString("hex"))}`,
    `proxy-url: ${JSON.stringify(networkProxy)}`,
    "logging-to-file: true", "usage-statistics-enabled: true", "",
  ].join("\n"), { mode: 0o600 });
}
const manifest = { version: 1, source, node: process.execPath, platform: process.platform, arch: process.arch };
writeFileSync(join(layout.deploymentRoot, "deployment.json"), JSON.stringify(manifest, null, 2));
if (existsSync(layout.appRoot)) {
  const backup = join(layout.deploymentRoot, "backups", `app-${Date.now()}`);
  mkdirSync(dirname(backup), { recursive: true });
  renameSync(layout.appRoot, backup);
}
renameSync(staging, layout.appRoot);
for (const action of ["start", "stop"]) {
  const label = action === "start" ? "Start" : "Stop";
  const entry = join(layout.appRoot, "scripts", `${action}.mjs`);
  writeFileSync(join(layout.deploymentRoot, `${label}-Workbench.cmd`), `@echo off\r\nchcp 65001 >nul\r\n"${process.execPath}" "${entry}"\r\nif errorlevel 1 pause\r\n`);
  const shell = join(layout.deploymentRoot, `${label}-Workbench.command`);
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(shell, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(entry)}\n`, { mode: 0o755 });
  if (process.platform !== "win32") chmodSync(shell, 0o755);
}
console.log(`部署完成 ${layout.deploymentRoot}`);
if (!values["no-start"]) run(process.execPath, [join(layout.appRoot, "scripts/start.mjs")], layout.appRoot);
