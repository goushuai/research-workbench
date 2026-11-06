import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
import { copilotHome } from "../src/server/paths.js";
import { queueResearch } from "../src/server/research.js";
import { reportSections } from "../src/shared/report-sections.js";
import {
  startFollowup,
  buildCandidatePrompt,
  parseCandidateResponse,
} from "../src/server/followups.js";
import type { FollowupInput } from "../src/shared/types.js";

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "followup-"));
  const dbPath = join(directory, "workbench.sqlite");
  const store = new Store(dbPath, DEFAULT_CONFIG);
  const tag = store.createTag({ name: "来源", color: "#fff" });
  const task = store.createTask({
    title: "原研究",
    description: "",
    tags: [tag.id],
    config: DEFAULT_CONFIG,
  });
  const run = store.createRun(task.id, {
    kind: "research",
    config: DEFAULT_CONFIG,
    sessionId: "source-session",
    directory,
    prompt: "原问题",
  });
  store.updateRun(run.id, { status: "completed" });
  mkdirSync(join(directory, "deliverables"));
  writeFileSync(
    join(directory, "deliverables/report.md"),
    "# 原报告\n实际报告证据 abc123",
  );
  const artifact = store.createArtifact({
    taskId: task.id,
    runId: run.id,
    title: "原报告",
    name: "报告.md",
    relativePath: "deliverables/report.md",
    folderId: null,
    tags: [tag.id],
  });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const input: FollowupInput = {
    intent: "deepen",
    feedback: ["增加技术细节"],
    instructions: "专门分析并发一致性",
    count: 3,
    config: DEFAULT_CONFIG,
  };
  return { store, artifact, input, directory, tag, dbPath };
}

test("deepen saves a source-linked topic without launching another research run", async (t) => {
  const { store, artifact, input, tag } = fixture(t);
  const result = await startFollowup(store, artifact.id, input);
  assert.equal(result.topic?.sourceArtifactId, artifact.id);
  assert.deepEqual(result.topic?.tags, [tag.id]);
  assert.match(result.topic!.description, /专门分析并发一致性/);
  assert.doesNotMatch(result.topic!.description, /反馈重点/);
  assert.equal(store.runs().length, 1);
  assert.equal(result.task, undefined);
  assert.equal(result.job, undefined);
});

test("selected chapters constrain deepen topics and candidate prompts", async (t) => {
  const { store, artifact, input, directory } = fixture(t);
  const report = "# 原报告\n\n## 调度\n分析并发调度\n\n## 业务\n分析业务界面\n";
  writeFileSync(join(directory, "deliverables/report.md"), report);
  const sectionIds = [reportSections(report)[1].id];
  const result = await startFollowup(store, artifact.id, { ...input, instructions: "", sectionIds });
  assert.match(result.topic!.description, /调度/);
  assert.deepEqual(result.topic!.sourceSectionIds, sectionIds);
  assert.doesNotMatch(result.topic!.description, /分析业务界面/);
  const prompt = buildCandidatePrompt(artifact.title, report, { ...input, intent: "derive", sectionIds });
  assert.match(prompt, /分析并发调度/);
  assert.doesNotMatch(prompt, /分析业务界面/);
  await assert.rejects(startFollowup(store, artifact.id, { ...input, sectionIds: ["missing"] }), /章节/);
});

test("long selected chapters remain separate from editable topic descriptions", async (t) => {
  const { store, artifact, input, directory } = fixture(t);
  writeFileSync(join(directory, "deliverables/report.md"), "# 长报告\n\n## 机制\n" + "资料正文".repeat(10000));
  const result = await startFollowup(store, artifact.id, { ...input, sectionIds: ["section-1"] });
  assert.ok(result.topic!.description.length < 20000);
  assert.deepEqual(result.topic!.sourceSectionIds, ["section-1"]);
});

test("followup rejects unknown intent, invalid count and malformed feedback before saving", async (t) => {
  const { store, artifact, input } = fixture(t);
  for (const patch of [
    { intent: "unknown" },
    { intent: "glossary", count: 0 },
    { intent: "derive", count: 11 },
    { intent: "glossary", count: 1.5 },
    { feedback: ["unknown"] },
    { feedback: "bad" },
    { instructions: 1 },
  ]) {
    await assert.rejects(
      startFollowup(store, artifact.id, {
        ...input,
        ...patch,
      } as FollowupInput),
    );
  }
  assert.equal(store.state().topics.length, 0);
});

test("followup source is read within the owning run directory", async (t) => {
  const { store, artifact, input, dbPath } = fixture(t);
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE artifacts SET data=? WHERE id=?").run(
    JSON.stringify({ ...artifact, relativePath: "../secret.md" }),
    artifact.id,
  );
  db.close();
  await assert.rejects(startFollowup(store, artifact.id, input), /路径/);
  assert.equal(store.state().topics.length, 0);
});

test("candidate prompt includes source text, requested count, feedback and instructions", () => {
  const prompt = buildCandidatePrompt("原报告", "实际报告证据 abc123", {
    intent: "derive",
    feedback: ["证据不够充分"],
    instructions: "研究并发",
    count: 2,
    config: DEFAULT_CONFIG,
  });
  assert.match(prompt, /实际报告证据 abc123/);
  assert.match(prompt, /研究并发/);
  assert.match(prompt, /证据不够充分/);
  assert.match(prompt, /2/);
});

test("rewrite queues the original task session with actual source report and materials", async (t) => {
  const { store, artifact, input, directory } = fixture(t);
  const sessionId = randomUUID();
  const sessionDirectory = join(copilotHome, "session-state", sessionId);
  mkdirSync(sessionDirectory, { recursive: true });
  writeFileSync(join(sessionDirectory, "events.jsonl"), "");
  const workspace = join(directory, "workspace");
  mkdirSync(join(workspace, "materials"), { recursive: true });
  store.updateRun(artifact.runId, {
    sessionId,
    config: { ...DEFAULT_CONFIG, workingDirectory: workspace },
  });
  t.after(() => rmSync(sessionDirectory, { recursive: true, force: true }));
  const result = await startFollowup(store, artifact.id, {
    ...input,
    intent: "rewrite",
  });
  const run = result.task!.latestRun!;
  t.after(() => rmSync(run.directory, { recursive: true, force: true }));
  assert.equal(result.task?.id, artifact.taskId);
  assert.equal(run.kind, "rewrite");
  assert.equal(run.sessionId, sessionId);
  assert.notEqual(run.directory, directory);
  assert.match(run.prompt, /实际报告证据 abc123/);
  assert.match(run.prompt, /专门分析并发一致性/);
  assert.ok(run.prompt.includes(join(workspace, "materials")));
  assert.ok(run.prompt.includes(join(run.directory, "deliverables")));
  assert.equal(
    JSON.parse(
      readFileSync(join(run.directory, "source-artifact.json"), "utf8"),
    ).artifactId,
    artifact.id,
  );
});

test("candidate parser reads final assistant JSON and pins app config and inherited tags", () => {
  const output = [
    JSON.stringify({
      type: "assistant.message",
      data: { content: "thinking", toolRequests: [{ id: "tool" }] },
    }),
    JSON.stringify({
      type: "assistant.message",
      data: {
        content: JSON.stringify([
          {
            title: "并发",
            description: "分析一致性",
            priority: "high",
            tags: ["untrusted"],
            config: { model: "untrusted" },
          },
        ]),
      },
    }),
    JSON.stringify({ type: "result", usage: {} }),
  ].join("\n");
  const result = parseCandidateResponse(output, 1, DEFAULT_CONFIG, ["tag-id"]);
  assert.equal(result[0].title, "并发");
  assert.equal(result[0].config.model, DEFAULT_CONFIG.model);
  assert.deepEqual(result[0].tags, ["tag-id"]);
  assert.ok(result[0].id);
  assert.throws(() =>
    parseCandidateResponse(
      '[{"title":"missing description"}]',
      1,
      DEFAULT_CONFIG,
      [],
    ),
  );
  assert.throws(() => parseCandidateResponse("[]", 1, DEFAULT_CONFIG, []));
});
test("glossary has its own count and depth instead of inheriting source task constraints", async (t) => {
  const { store, artifact, input } = fixture(t);
  const sessionId = randomUUID();
  const sessionDirectory = join(copilotHome, "session-state", sessionId);
  mkdirSync(sessionDirectory, { recursive: true });
  writeFileSync(join(sessionDirectory, "events.jsonl"), "");
  store.updateRun(artifact.runId, { sessionId });
  const sourceContext = { directories: [join(artifact.relativePath, "original-materials")] };
  writeFileSync(join(store.run(artifact.runId)!.directory, "source-context.json"), JSON.stringify(sourceContext));
  t.after(() => rmSync(sessionDirectory, { recursive: true, force: true }));
  const result = await startFollowup(store, artifact.id, {
    ...input,
    intent: "glossary",
    count: 25,
    glossaryDepth: "technical",
    config: {
      ...DEFAULT_CONFIG,
      taskInstructions: "原任务必须写万字源码剖析",
      lengthPreset: "long",
      reportType: "source_analysis",
    },
  });
  const run = result.task!.latestRun!;
  t.after(() => rmSync(run.directory, { recursive: true, force: true }));
  assert.match(run.prompt, /最多 25 个关键术语/);
  assert.match(run.prompt, /常见误区/);
  assert.doesNotMatch(run.prompt, /10000|原任务必须/);
  assert.equal(run.config.taskInstructions, "");
  assert.equal(run.config.length, "按术语数量与解释深度");
  store.updateRun(run.id, { status: "completed" });
  const resumed = queueResearch(store, store.task(artifact.taskId)!, run.config, "补充调度术语", "resume");
  t.after(() => rmSync(resumed.directory, { recursive: true, force: true }));
  assert.match(resumed.prompt, /最多 25 个关键术语/);
  assert.match(resumed.prompt, /常见误区/);
  assert.match(resumed.prompt, /补充调度术语/);
  assert.doesNotMatch(resumed.prompt, /正文目标篇幅|原任务必须/);
  assert.deepEqual(JSON.parse(readFileSync(join(resumed.directory, "source-context.json"), "utf8")), sourceContext);
});
