import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG, normalizeModels } from "../src/server/models.js";
import { createApp } from "../src/server/api.js";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { rmSync } from "node:fs";
import { dataRoot } from "../src/server/paths.js";
async function fixture() {
  const store = new Store(":memory:", DEFAULT_CONFIG);
  const app = createApp(store, async () =>
    normalizeModels([{ id: "gpt-6-luna" }]),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as any;
  const url = `http://127.0.0.1:${address.port}`;
  const bootstrap = await fetch(url + "/api/state");
  const cookie = bootstrap.headers.get("set-cookie")!.split(";")[0];
  const headers = {
    "Content-Type": "application/json",
    "X-Workbench-Request": "1",
    Cookie: cookie,
  };
  return {
    store,
    url,
    headers,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          store.close();
          resolve();
        }),
      ),
  };
}

test("task deletion endpoint removes completed history and rejects queued work", async () => {
  const f = await fixture();
  try {
    const task = f.store.createTask({ title: "删除验收", description: "", tags: [], config: DEFAULT_CONFIG });
    const run = f.store.createRun(task.id, { kind: "research", config: DEFAULT_CONFIG, sessionId: "delete-api", directory: "unused", prompt: "" });
    const remove = () => fetch(f.url + `/api/tasks/${task.id}`, { method: "DELETE", headers: f.headers });
    assert.equal((await remove()).status, 400);
    assert.ok(f.store.task(task.id));
    f.store.updateRun(run.id, { status: "completed" });
    assert.equal((await remove()).status, 200);
    assert.equal(f.store.task(task.id), undefined);
    assert.equal(f.store.run(run.id), undefined);
  } finally { await f.close(); }
});

test("programmatic PDF conversion is idempotent, registered and served inline", async () => {
  const f = await fixture();
  const directory = mkdtempSync(join(tmpdir(), ".artifact-pdf-"));
  try {
    writeFileSync(join(directory, "report.md"), "# 中文转换验收\n\n这是**Markdown**正文。\n\n|项目|结果|\n|---|---|\n|转换|成功|\n\n```ts\nconst value = 42;\n```\n");
    const task = f.store.createTask({ title: "转换验收", description: "", config: DEFAULT_CONFIG, tags: [] });
    const run = f.store.createRun(task.id, { kind: "research", config: DEFAULT_CONFIG, sessionId: "pdf-test", directory, prompt: "" });
    const source = f.store.createArtifact({ taskId: task.id, runId: run.id, title: "中文转换验收", name: "报告.md", relativePath: "report.md", folderId: null, tags: [] });
    const convert = () => fetch(f.url + `/api/artifacts/${source.id}/pdf`, { method: "POST", headers: f.headers, body: "{}" });
    const responses = await Promise.all([convert(), convert()]);
    for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
    const pdf = await responses[0].json() as any;
    assert.equal(pdf.convertedFromArtifactId, source.id);
    assert.equal((await responses[1].json() as any).id, pdf.id);
    assert.equal(f.store.state().artifacts.length, 2);
    const bytes = readFileSync(join(directory, pdf.relativePath));
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const view = await fetch(f.url + `/api/artifacts/${pdf.id}/view`);
    assert.equal(view.status, 200);
    assert.equal(view.headers.get("content-type"), "application/pdf");
    assert.match(view.headers.get("content-disposition")!, /^inline/);
    assert.equal(Buffer.from(await view.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    const invalid = await fetch(f.url + `/api/artifacts/${pdf.id}/pdf`, { method: "POST", headers: f.headers, body: "{}" });
    assert.equal(invalid.status, 400);
  } finally {
    await f.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("topic launch freezes rich config and automatically assigns project subdirectories", async () => {
  const f = await fixture();
  let run: any;
  try {
    const config = {
      ...DEFAULT_CONFIG,
      taskInstructions: "逐条核对原始来源，保留待验证项。",
      taskTemplateId: "builtin:derivation",
      taskTemplateName: "推导式理解",
      reportType: "derivation",
      depth: "deep",
      lengthPreset: "long",
      focusAreas: ["mechanism", "evidence"],
      readerRole: "engineer",
      familiarity: "familiar",
      sourcePreference: "official",
      reuseStrategy: "existing_only",
    };
    const response = await fetch(f.url + "/api/topics", {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({
        title: "配置验收",
        description: "只读取已有资料",
        priority: "normal",
        tags: [],
        config,
      }),
    });
    assert.equal(response.status, 201);
    const topic = (await response.json()) as any;
    const launch = await fetch(f.url + `/api/topics/${topic.id}/start`, {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal(launch.status, 201);
    run = ((await launch.json()) as any).task.latestRun;
    assert.equal(run.config.reportType, "derivation");
    assert.equal(
      f.store.state().topics.some((item) => item.id === topic.id),
      false,
    );
    const reloaded = f.store.topic(topic.id)!;
    assert.equal(reloaded.config.taskTemplateId, "builtin:derivation");
    assert.equal(reloaded.config.taskTemplateName, "推导式理解");
    assert.equal(run.config.taskTemplateId, "builtin:derivation");
    assert.equal(run.config.depth, "deep");
    assert.deepEqual(run.config.focusAreas, ["mechanism", "evidence"]);
    assert.equal(run.config.length, "10000～15000 字");
    assert.equal(dirname(run.directory), join(dataRoot, "runs"));
    assert.equal(
      dirname(run.config.workingDirectory),
      join(dataRoot, "workspaces"),
    );
    assert.match(run.prompt, /具体问题出现/);
    assert.match(run.prompt, /不联网补查/);
    assert.ok(run.prompt.includes(config.taskInstructions));
    const retry = await fetch(f.url + `/api/topics/${topic.id}/start`, {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal(retry.status, 201);
    assert.equal(((await retry.json()) as any).task.latestRun.id, run.id);
    assert.equal(f.store.state().tasks.length, 1);
  } finally {
    await f.close();
    if (run) {
      assert.equal(dirname(run.directory), join(dataRoot, "runs"));
      assert.equal(
        dirname(run.config.workingDirectory),
        join(dataRoot, "workspaces"),
      );
      rmSync(run.directory, { recursive: true, force: true });
      rmSync(run.config.workingDirectory, { recursive: true, force: true });
    }
  }
});
test("custom task template instructions survive create, edit and reload", async () => {
  const f = await fixture();
  try {
    const config = {
      ...DEFAULT_CONFIG,
      taskInstructions: "先复现故障，逐个验证根因假设。",
    };
    const response = await fetch(f.url + "/api/templates", {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({ name: "故障调查", config }),
    });
    assert.equal(response.status, 201);
    const template = (await response.json()) as any;
    assert.equal(template.config.taskInstructions, config.taskInstructions);
    const updated = await fetch(f.url + `/api/templates/${template.id}`, {
      method: "PATCH",
      headers: f.headers,
      body: JSON.stringify({
        config: { ...config, taskInstructions: "补充异常路径和回归验证。" },
      }),
    });
    assert.equal(updated.status, 200);
    const state = (await (await fetch(f.url + "/api/state")).json()) as any;
    assert.equal(
      state.templates.find((item: any) => item.id === template.id).config
        .taskInstructions,
      "补充异常路径和回归验证。",
    );
  } finally {
    await f.close();
  }
});
test("source-linked future topics receive their original report and material access on launch", async () => {
  const f = await fixture();
  const sourceDirectory = mkdtempSync(join(tmpdir(), "followup-source-"));
  let run: any;
  try {
    mkdirSync(join(sourceDirectory, "deliverables"));
    mkdirSync(join(sourceDirectory, "workspace", "materials"), {
      recursive: true,
    });
    writeFileSync(
      join(sourceDirectory, "deliverables", "report.md"),
      "# 来源报告\n\n## 选定章节\n来源内容 sentinel\n\n## 其他章节\nexcluded section body",
    );
    const sourceTask = f.store.createTask({
      title: "source",
      description: "source",
      tags: [],
      config: DEFAULT_CONFIG,
    });
    const sourceRun = f.store.createRun(sourceTask.id, {
      kind: "research",
      config: {
        ...DEFAULT_CONFIG,
        workingDirectory: join(sourceDirectory, "workspace"),
      },
      sessionId: crypto.randomUUID(),
      directory: sourceDirectory,
      prompt: "source",
    });
    const artifact = f.store.createArtifact({
      taskId: sourceTask.id,
      runId: sourceRun.id,
      title: "source",
      name: "source.md",
      relativePath: "deliverables/report.md",
      folderId: null,
      tags: [],
    });
    const topic = f.store.createTopic({
      title: "derived",
      description: "继续分析",
      priority: "normal",
      tags: [],
      config: { ...DEFAULT_CONFIG, reuseStrategy: "existing_only" },
      sourceArtifactId: artifact.id,
      sourceSectionIds: ["section-1"],
    });
    const response = await fetch(f.url + `/api/topics/${topic.id}/start`, {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal(response.status, 201);
    run = ((await response.json()) as any).task.latestRun;
    assert.match(run.prompt, /来源内容 sentinel/);
    assert.match(run.prompt, /研究方向限定在所选章节 选定章节/);
    assert.doesNotMatch(run.prompt, /excluded section body/);
    assert.ok(
      run.prompt.includes(join(sourceDirectory, "workspace", "materials")),
    );
    const context = JSON.parse(
      readFileSync(join(run.directory, "source-context.json"), "utf8"),
    );
    assert.deepEqual(context.directories, [
      sourceDirectory,
      join(sourceDirectory, "workspace"),
    ]);
  } finally {
    await f.close();
    assert.ok(sourceDirectory.startsWith(tmpdir()));
    rmSync(sourceDirectory, { recursive: true, force: true });
    if (run) {
      assert.equal(dirname(run.directory), join(dataRoot, "runs"));
      assert.equal(
        dirname(run.config.workingDirectory),
        join(dataRoot, "workspaces"),
      );
      rmSync(run.directory, { recursive: true, force: true });
      rmSync(run.config.workingDirectory, { recursive: true, force: true });
    }
  }
});
test("artifact resources reject active HTML content on the app origin", async () => {
  const f = await fixture();
  try {
    const directory = mkdtempSync(join(tmpdir(), "resource-"));
    mkdirSync(join(directory, "deliverables"));
    writeFileSync(join(directory, "deliverables", "report.md"), "# Report");
    writeFileSync(
      join(directory, "deliverables", "evil.html"),
      "<script>alert(1)</script>",
    );
    const task = f.store.createTask({
      title: "x",
      description: "x",
      config: DEFAULT_CONFIG,
      tags: [],
    });
    const run = f.store.createRun(task.id, {
      kind: "research",
      config: DEFAULT_CONFIG,
      sessionId: "x",
      prompt: "x",
      directory,
    });
    const artifact = f.store.createArtifact({
      taskId: task.id,
      runId: run.id,
      title: "x",
      name: "report.md",
      relativePath: "deliverables/report.md",
      folderId: null,
      tags: [],
    });
    const response = await fetch(
      f.url + `/api/artifacts/${artifact.id}/resource?path=evil.html`,
      { headers: f.headers },
    );
    assert.equal(response.status, 415);
  } finally {
    await f.close();
  }
});
test("settings persist selected model and reasoning level and reject unsupported combinations", async () => {
  const f = await fixture();
  try {
    const result = await fetch(f.url + "/api/settings", {
      method: "PUT",
      headers: f.headers,
      body: JSON.stringify({ ...DEFAULT_CONFIG, reasoningEffort: "high" }),
    });
    assert.equal(result.status, 200);
    assert.equal(f.store.settings().reasoningEffort, "high");
    const invalid = await fetch(f.url + "/api/settings", {
      method: "PUT",
      headers: f.headers,
      body: JSON.stringify({ ...DEFAULT_CONFIG, reasoningEffort: "minimal" }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(f.store.settings().reasoningEffort, "high");
  } finally {
    await f.close();
  }
});
test("YAML import accepts both task documents and standalone rich configurations", async () => {
  const f = await fixture();
  try {
    const config = {
      ...DEFAULT_CONFIG,
      reportType: "derivation",
      depth: "deep",
      lengthPreset: "long",
      focusAreas: ["evidence"],
      reasoningEffort: "medium",
    };
    for (const document of [
      config,
      { title: "研究目标", goal: "目标正文", config },
    ]) {
      const result = await fetch(f.url + "/api/config/import", {
        method: "POST",
        headers: f.headers,
        body: JSON.stringify({ yaml: JSON.stringify(document) }),
      });
      assert.equal(result.status, 200);
      const value = ((await result.json()) as any).config;
      assert.equal(value.reportType, "derivation");
      assert.equal(value.depth, "deep");
      assert.equal(value.lengthPreset, "long");
      assert.deepEqual(value.focusAreas, ["evidence"]);
      assert.equal(value.reasoningEffort, "medium");
    }
  } finally {
    await f.close();
  }
});
test("mutations require session cookie and custom header and reject external origins", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await fetch(f.url + "/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"name":"x","color":"#000000"}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(f.url + "/api/tags", {
          method: "POST",
          headers: { ...f.headers, Origin: "https://example.com" },
          body: '{"name":"x","color":"#000000"}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(f.url + "/api/tags", {
          method: "POST",
          headers: f.headers,
          body: '{"name":"AGENT","color":"#123456"}',
        })
      ).status,
      201,
    );
  } finally {
    await f.close();
  }
});
test("topic creation retains selected model and server validates priority", async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.url + "/api/topics", {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({
        title: "测试",
        description: "范围",
        priority: "high",
        tags: [],
        config: { ...DEFAULT_CONFIG, reasoningEffort: "low" },
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(f.store.state().topics[0].config.reasoningEffort, "low");
    const invalid = await fetch(f.url + "/api/topics", {
      method: "POST",
      headers: f.headers,
      body: JSON.stringify({
        title: "测试",
        description: "范围",
        priority: "invalid",
        tags: [],
        config: DEFAULT_CONFIG,
      }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await f.close();
  }
});
