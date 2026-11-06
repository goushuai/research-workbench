import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TASK_TEMPLATES } from "../src/shared/task-templates.js";
import { Store } from "../src/server/store.js";
import { normalizeResearchConfig } from "../src/shared/config.js";
import type { ResearchConfig, Candidate } from "../src/shared/types.js";

const config: ResearchConfig = normalizeResearchConfig({
  model: "test",
  reasoningEffort: "default",
  styles: ["technical"],
  audience: "开发者",
  length: "long",
  workingDirectory: ".",
  outputDirectory: "./reports",
  budgetMinutes: 60,
  permission: "limited",
  format: "markdown",
});
const topicInput = {
  title: "研究",
  description: "证据",
  priority: "normal" as const,
  tags: [],
  config,
};

test("report formats share archive metadata and deleting the report removes every format record", () => {
  const store = new Store(":memory:", config);
  try {
    const task = store.createTask(topicInput);
    const run = store.createRun(task.id, { kind: "research", sessionId: "formats", directory: "unused", prompt: "", config });
    const input = { taskId: task.id, runId: run.id, title: "报告", name: "报告.md", relativePath: "report.md", folderId: null, tags: [] };
    const md = store.createArtifact(input);
    const pdf = store.createArtifact({ ...input, name: "报告.pdf", relativePath: "report.pdf", convertedFromArtifactId: md.id });
    const folder = store.createFolder({ name: "归档", parentId: null });
    const tag = store.createTag({ name: "标记", color: "#ffffff" });
    store.updateArtifact(md.id, { name: "更新名称.md", folderId: folder.id, tags: [tag.id] });
    assert.equal(store.artifact(pdf.id)?.name, "更新名称.pdf");
    assert.equal(store.artifact(pdf.id)?.folderId, folder.id);
    assert.deepEqual(store.artifact(pdf.id)?.tags, [tag.id]);
    assert.equal(store.artifact(pdf.id)?.relativePath, "report.pdf");
    store.deleteArtifact(md.id);
    assert.equal(store.artifact(md.id), undefined);
    assert.equal(store.artifact(pdf.id), undefined);
  } finally { store.close(); }
});

test("built-in template deletion persists without changing historical task configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "template-delete-"));
  const database = join(directory, "store.sqlite");
  let store = new Store(database, config);
  try {
    const id = TASK_TEMPLATES[0].id;
    const task = store.createTask({ ...topicInput, config: { ...config, taskTemplateId: `builtin:${id}`, taskTemplateName: TASK_TEMPLATES[0].name } });
    store.deleteBuiltInTemplate(id);
    assert.ok(store.state().hiddenTaskTemplateIds.includes(id));
    store.deleteBuiltInTemplate(id);
    assert.equal(store.state().hiddenTaskTemplateIds.length, 1);
    assert.throws(() => store.deleteBuiltInTemplate("missing"));
    store.close();
    store = new Store(database, config);
    assert.ok(store.state().hiddenTaskTemplateIds.includes(id));
    assert.equal(store.task(task.id)?.config.taskTemplateId, `builtin:${id}`);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("task deletion removes linked records atomically and guards active work", () => {
  const store = new Store(":memory:", config);
  try {
    const topic = store.createTopic(topicInput);
    const task = store.startTopic(topic.id, config, { sessionId: "delete-session", directory: "unused", prompt: "goal" }, "delete-request");
    assert.throws(() => store.deleteTask(task.id), /停止/);
    store.updateRun(task.latestRun!.id, { status: "completed" });
    const artifact = store.createArtifact({ taskId: task.id, runId: task.latestRun!.id, title: "报告", name: "报告.md", relativePath: "report.md", tags: [], folderId: null });
    const job = store.createCandidateJob(artifact.id);
    assert.throws(() => store.deleteTask(task.id), /候选/);
    store.updateCandidateJob(job.id, { status: "completed" });
    const future = store.createTopic({ ...topicInput, sourceArtifactId: artifact.id });
    store.deleteTask(task.id);
    assert.equal(store.task(task.id), undefined);
    assert.equal(store.run(task.latestRun!.id), undefined);
    assert.equal(store.artifact(artifact.id), undefined);
    assert.equal(store.candidateJob(job.id), undefined);
    assert.equal(store.topic(future.id)?.sourceArtifactId, undefined);
    assert.equal(store.state().topics.some((item) => item.id === topic.id), false);
    assert.equal(store.topic(topic.id)?.archived, true);
    assert.equal(store.topic(topic.id)?.startedTaskId, undefined);
  } finally { store.close(); }
});
test("topic launch retains automatically assigned workspace in its run snapshot", () => {
  const store = new Store(":memory:", config);
  try {
    const topic = store.createTopic(topicInput);
    const task = store.startTopic(
      topic.id,
      config,
      {
        config: {
          ...config,
          workingDirectory: "managed-workspace",
          outputDirectory: "",
        },
        sessionId: "managed",
        directory: "run",
        prompt: "goal",
      },
      "managed-request",
    );
    assert.equal(task.latestRun?.config.workingDirectory, "managed-workspace");
    assert.equal(task.latestRun?.config.reportType, config.reportType);
  } finally {
    store.close();
  }
});
const runInput = {
  kind: "research" as const,
  config,
  sessionId: "session",
  prompt: "研究",
  directory: ".",
};
function fixture(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "research-store-"));
  const path = join(dir, "db.sqlite");
  const store = new Store(path, config);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, path };
}

test("persists populated records and merges new default settings on reopen", (t) => {
  const { store, path } = fixture(t);
  const tag = store.createTag({ name: "资料", color: "#123456" });
  const topic = store.createTopic({ ...topicInput, tags: [tag.id] });
  const template = store.createTemplate({ name: "深入", config });
  store.saveSettings({ ...config, budgetMinutes: 90 });
  store.close();
  const reopened = new Store(path, { ...config, audience: "new" });
  t.after(() => reopened.close());
  assert.equal(reopened.state().topics[0].id, topic.id);
  assert.equal(reopened.state().templates[0].id, template.id);
  assert.equal(reopened.settings().budgetMinutes, 90);
  assert.equal(reopened.settings().audience, "开发者");
  reopened.close();
});

test("starts topics atomically and idempotently and serializes active sessions", (t) => {
  const { store } = fixture(t);
  const topic = store.createTopic(topicInput);
  const task = store.startTopic(topic.id, config, runInput, "start-one");
  assert.equal(
    store.startTopic(topic.id, config, runInput, "start-one").id,
    task.id,
  );
  assert.equal(store.state().tasks.length, 1);
  assert.equal(
    store.state().topics.some((item) => item.id === topic.id),
    false,
  );
  assert.equal(store.topic(topic.id)?.startedTaskId, task.id);
  assert.equal(
    store.startTopic(
      topic.id,
      config,
      { ...runInput, sessionId: "duplicate" },
      "another-click",
    ).id,
    task.id,
  );
  const other = store.createTopic(topicInput);
  assert.throws(() =>
    store.startTopic(other.id, config, runInput, "start-two"),
  );
  assert.equal(store.state().tasks.length, 1);
  assert.equal(
    store.state().topics.find((x) => x.id === other.id)?.startedTaskId,
    undefined,
  );
  const run = task.latestRun!;
  assert.equal(store.createRun(task.id, runInput, "start-one").id, run.id);
  store.updateRun(run.id, { status: "completed" });
  const second = store.startTopic(other.id, config, runInput, "start-two");
  assert.notEqual(second.id, task.id);
  assert.equal(store.task(task.id)?.runs.length, 1);
});

test("run idempotency and active session constraints survive reopen", (t) => {
  const { store, path } = fixture(t);
  const task = store.createTask(topicInput);
  const run = store.createRun(task.id, runInput, "request");
  store.close();
  const reopened = new Store(path, config);
  t.after(() => reopened.close());
  assert.equal(reopened.createRun(task.id, runInput, "request").id, run.id);
  assert.throws(() => reopened.createRun(task.id, runInput, "another"));
  assert.equal(reopened.runs().length, 1);
  reopened.close();
});

test("validates references, folder cycles and artifact paths", (t) => {
  const { store } = fixture(t);
  const a = store.createFolder({ name: "A", parentId: null });
  const b = store.createFolder({ name: "B", parentId: a.id });
  assert.throws(() => store.updateFolder(a.id, { parentId: b.id }));
  assert.throws(() => store.createFolder({ name: "bad", parentId: "missing" }));
  assert.throws(() => store.createTopic({ ...topicInput, tags: ["missing"] }));
  const task = store.createTask(topicInput);
  const run = store.createRun(task.id, runInput);
  const input = {
    taskId: task.id,
    runId: run.id,
    title: "报告",
    name: "报告.md",
    relativePath: "deliverables/report.md",
    folderId: b.id,
    tags: [],
  };
  assert.throws(() =>
    store.createArtifact({ ...input, relativePath: "../secret" }),
  );
  assert.throws(() =>
    store.createArtifact({ ...input, relativePath: "C:\\secret" }),
  );
  const artifact = store.createArtifact(input);
  assert.equal(store.artifact(artifact.id)?.title, "报告");
  store.deleteFolder(a.id);
  assert.equal(store.state().folders.length, 0);
  assert.equal(store.artifact(artifact.id)?.folderId, null);
});

test("saves edited candidates atomically and idempotently and cleans deleted tags", (t) => {
  const { store } = fixture(t);
  const tag = store.createTag({ name: "tag", color: "#fff" });
  const task = store.createTask({ ...topicInput, tags: [tag.id] });
  const run = store.createRun(task.id, runInput);
  const artifact = store.createArtifact({
    taskId: task.id,
    runId: run.id,
    title: "report",
    name: "report.md",
    relativePath: "deliverables/report.md",
    folderId: null,
    tags: [tag.id],
  });
  const job = store.createCandidateJob(artifact.id);
  const candidate: Candidate = { ...topicInput, id: "c1", tags: [tag.id] };
  store.updateCandidateJob(job.id, {
    status: "completed",
    candidates: [candidate],
  });
  const [topic] = store.saveCandidates(job.id, [candidate]);
  assert.equal(store.saveCandidates(job.id, [candidate])[0].id, topic.id);
  assert.equal(
    store.candidateJob(job.id)?.candidates[0].savedTopicId,
    topic.id,
  );
  assert.equal(topic.sourceArtifactId, artifact.id);
  assert.throws(() =>
    store.saveCandidates(job.id, [
      { ...candidate, id: "c2" },
      { ...candidate, id: "c3", tags: ["missing"] },
    ]),
  );
  assert.equal(store.state().topics.length, 1);
  store.deleteTag(tag.id);
  assert.deepEqual(store.task(task.id)?.tags, []);
  assert.deepEqual(store.artifact(artifact.id)?.tags, []);
  assert.deepEqual(store.state().topics[0].tags, []);
  assert.deepEqual(store.candidateJob(job.id)?.candidates[0].tags, []);
});

test("updates and deletes mutable entities without changing stable identities", (t) => {
  const { store } = fixture(t);
  const tag = store.createTag({ name: "old", color: "#fff" });
  assert.equal(store.updateTag(tag.id, { name: "new" }).name, "new");
  const topic = store.createTopic(topicInput);
  assert.equal(
    store.updateTopic(topic.id, { title: "changed" }).title,
    "changed",
  );
  const template = store.createTemplate({ name: "old", config });
  assert.equal(store.updateTemplate(template.id, { name: "new" }).name, "new");
  store.deleteTopic(topic.id);
  store.deleteTemplate(template.id);
  assert.equal(store.state().topics.length, 0);
  assert.equal(store.state().templates.length, 0);
  assert.throws(() => store.updateTopic("missing", { title: "x" }));
});

test("fills newly introduced config fields in settings and historical snapshots", (t) => {
  const { store, path } = fixture(t);
  const topic = store.createTopic(topicInput);
  store.close();
  const db = new DatabaseSync(path);
  db.prepare("INSERT INTO settings(id,data) VALUES(1,?)").run(
    JSON.stringify({ model: "old-model" }),
  );
  db.prepare("UPDATE topics SET data=? WHERE id=?").run(
    JSON.stringify({ ...topic, config: { model: "old-model" } }),
    topic.id,
  );
  db.close();
  const reopened = new Store(path, config);
  t.after(() => reopened.close());
  assert.equal(reopened.settings().model, "old-model");
  assert.equal(reopened.settings().budgetMinutes, 60);
  assert.deepEqual(reopened.state().topics[0].config.styles, ["technical"]);
  reopened.close();
});

test("artifact updates enforce parent and run references and deletion detaches descendants", (t) => {
  const { store } = fixture(t);
  const task = store.createTask(topicInput);
  const run = store.createRun(task.id, runInput);
  const input = {
    taskId: task.id,
    runId: run.id,
    title: "report",
    name: "report.md",
    relativePath: "deliverables/report.md",
    folderId: null,
    tags: [],
  };
  const parent = store.createArtifact(input);
  const child = store.createArtifact({ ...input, parentArtifactId: parent.id });
  assert.throws(() =>
    store.updateArtifact(parent.id, { parentArtifactId: child.id }),
  );
  assert.throws(() => store.updateArtifact(child.id, { folderId: "missing" }));
  assert.equal(
    store.updateArtifact(child.id, { name: "renamed.md" }).name,
    "renamed.md",
  );
  const other = store.createTask(topicInput);
  assert.throws(() => store.createArtifact({ ...input, taskId: other.id }));
  const job = store.createCandidateJob(parent.id);
  const topic = store.createTopic({
    ...topicInput,
    sourceArtifactId: parent.id,
  });
  assert.throws(() => store.deleteArtifact(parent.id), /候选/);
  store.updateCandidateJob(job.id, { status: "completed" });
  store.deleteArtifact(parent.id);
  assert.equal(store.artifact(parent.id), undefined);
  assert.equal(store.artifact(child.id)?.parentArtifactId, undefined);
  assert.equal(store.candidateJob(job.id), undefined);
  assert.equal(
    store.state().topics.find((item) => item.id === topic.id)?.sourceArtifactId,
    undefined,
  );
});
