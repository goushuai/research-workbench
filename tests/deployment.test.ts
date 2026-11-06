import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtimeLayout } from "../scripts/layout.mjs";
import { installationTarget, verifyDownload } from "../scripts/install-support.mjs";
import { migrateLegacy, relocateText } from "../scripts/migrate-legacy.mjs";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
import { publicSetup } from "../src/shared/setup.js";

test("deployment layout separates source, runtime and platform assets", () => {
  const root = join(tmpdir(), "source-project");
  const layout = runtimeLayout(root, {});
  assert.equal(layout.deploymentRoot, root + "-deploy");
  assert.equal(layout.dataRoot, join(root + "-deploy", "state/workbench"));
  for (const platform of ["darwin", "win32"]) for (const arch of ["x64", "arm64"]) {
    const target = installationTarget(platform, arch);
    assert.equal(target.digest.length, 64);
    assert.match(target.file, arch === "arm64" ? /aarch64/ : /amd64/);
  }
  assert.throws(() => installationTarget("unknown", "x64"));
  assert.throws(() => verifyDownload(Buffer.from("bad download"), "0".repeat(64)));
});

test("Windows lowercase session scopes retain normalized casing after relocation", () => {
  const source = "C:\\Projects\\Research\\.local-state";
  const target = "D:\\Deployment\\state";
  const content = JSON.stringify({ directory: source.toLowerCase() + "\\workbench\\workspaces\\session" });
  const relocated = JSON.parse(relocateText(content, [[source, target]]));
  assert.equal(relocated.directory, target.toLowerCase() + "\\workbench\\workspaces\\session");
});

test("public setup keeps configurations and templates while excluding private records and machine paths", () => {
  const source = new Store(":memory:", DEFAULT_CONFIG);
  try {
    const template = source.createTemplate({ name: "共享模板", config: DEFAULT_CONFIG });
    source.saveSettings({ ...DEFAULT_CONFIG, taskTemplateId: template.id, model: "gpt-6.1-sol", workingDirectory: "private-workspace", outputDirectory: "private-output", ...{ apiKey: "private-key" } });
    source.createTopic({ title: "私人课题", description: "private-report", priority: "normal", config: DEFAULT_CONFIG, tags: [] });
    const seed = publicSetup(source.state(), DEFAULT_CONFIG);
    const text = JSON.stringify(seed);
    for (const value of ["private-key", "private-workspace", "private-output", "私人课题", "private-report"])
      assert.ok(!text.includes(value));
    const fresh = new Store(":memory:", DEFAULT_CONFIG, seed);
    try {
      assert.equal(fresh.state().tasks.length, 0);
      assert.equal(fresh.state().topics.length, 0);
      assert.equal(fresh.state().artifacts.length, 0);
      assert.equal(fresh.state().templates.length, 1);
      assert.equal(fresh.settings().model, "gpt-6.1-sol");
      assert.equal(fresh.settings().taskTemplateId, fresh.state().templates[0].id);
    } finally { fresh.close(); }
  } finally { source.close(); }
});

test("legacy migration preserves records and credentials and relocates session paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "migration-test-"));
  const source = join(directory, "source");
  const deployment = join(directory, "source-deploy");
  const oldState = join(source, ".local-state");
  const database = join(oldState, "workbench/workbench.sqlite");
  const store = new Store(database, DEFAULT_CONFIG);
  const workspace = join(oldState, "workbench/workspaces/session");
  const task = store.createTask({ title: "保留研究", description: "goal", tags: [], config: DEFAULT_CONFIG });
  const run = store.createRun(task.id, { kind: "research", config: { ...DEFAULT_CONFIG, workingDirectory: workspace }, sessionId: "session", directory: join(oldState, "workbench/runs/run"), prompt: workspace });
  store.updateRun(run.id, { status: "completed" });
  store.close();
  mkdirSync(join(oldState, "workbench/runs/run/deliverables"), { recursive: true });
  const originalReport = `# Original report\n${workspace}`;
  writeFileSync(join(oldState, "workbench/runs/run/deliverables/report.md"), originalReport);
  mkdirSync(join(oldState, "cliproxyapi/auth"), { recursive: true });
  const credential = '{"access_token":"private-fixture-token"}';
  writeFileSync(join(oldState, "cliproxyapi/auth/account.json"), credential);
  mkdirSync(join(source, ".local-tools/copilot"), { recursive: true });
  writeFileSync(join(source, ".local-tools/copilot/tool.txt"), "existing-tool");
  mkdirSync(join(deployment, "tools/node"), { recursive: true });
  writeFileSync(join(deployment, "tools/node/bootstrap.txt"), "portable-node");
  writeFileSync(join(oldState, "workbench/scope-session.json"), JSON.stringify({ directory: workspace, account: "fingerprint" }));
  try {
    const result = migrateLegacy(source, deployment);
    const migrated = new Store(join(result.state, "workbench/workbench.sqlite"), DEFAULT_CONFIG);
    try {
      assert.equal(migrated.task(task.id)?.title, "保留研究");
      assert.equal(migrated.run(run.id)?.config.workingDirectory, join(deployment, "state/workbench/workspaces/session"));
    } finally { migrated.close(); }
    assert.equal(readFileSync(join(result.state, "cliproxyapi/auth/account.json"), "utf8"), credential);
    assert.equal(JSON.parse(readFileSync(join(result.state, "workbench/scope-session.json"), "utf8")).directory, join(deployment, "state/workbench/workspaces/session"));
    assert.ok(existsSync(join(result.backup, "state/workbench/workbench.sqlite")));
    assert.equal(readFileSync(join(result.tools, "node/bootstrap.txt"), "utf8"), "portable-node");
    assert.equal(readFileSync(join(result.tools, "copilot/tool.txt"), "utf8"), "existing-tool");
    assert.ok(!existsSync(oldState));
    assert.equal(readFileSync(join(result.state, "workbench/runs/run/deliverables/report.md"), "utf8"), originalReport);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
