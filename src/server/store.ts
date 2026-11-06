import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, posix, win32 } from "node:path";
import { normalizeResearchConfig } from "../shared/config.js";
import { restoreTaskTemplateSelection, TASK_TEMPLATES } from "../shared/task-templates.js";
import type {
  Artifact,
  Candidate,
  CandidateJob,
  Folder,
  ResearchConfig,
  Run,
  Tag,
  Task,
  Template,
  Topic,
  WorkbenchState,
} from "../shared/types.js";
import type { PublicSetup } from "../shared/setup.js";

interface Entities {
  tags: Tag;
  topics: Topic;
  templates: Template;
  tasks: Omit<Task, "runs" | "latestRun">;
  runs: Run;
  folders: Folder;
  artifacts: Artifact;
  candidate_jobs: CandidateJob;
}
type Table = keyof Entities;
type RunInput = Pick<
  Run,
  "kind" | "config" | "sessionId" | "prompt" | "directory" | "contentKind" | "contentGoal"
>;
const activeStatuses = [
  "queued",
  "starting",
  "running",
  "waiting_input",
  "finalizing",
];

export class Store {
  private db: DatabaseSync;
  private defaults: ResearchConfig;
  private closed = false;

  constructor(dbPath: string, defaults: ResearchConfig, seed?: PublicSetup) {
    this.defaults = structuredClone(defaults);
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, data TEXT NOT NULL,
        parent_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.parentId')) STORED REFERENCES folders(id));
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL,
        task_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.taskId')) STORED NOT NULL REFERENCES tasks(id),
        session_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.sessionId')) STORED NOT NULL,
        status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED NOT NULL,
        request_id TEXT UNIQUE);
      CREATE UNIQUE INDEX IF NOT EXISTS active_session ON runs(session_id) WHERE status IN ('queued','starting','running','waiting_input','finalizing');
      CREATE INDEX IF NOT EXISTS runs_task ON runs(task_id);
      CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, data TEXT NOT NULL,
        task_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.taskId')) STORED NOT NULL REFERENCES tasks(id),
        run_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.runId')) STORED NOT NULL REFERENCES runs(id),
        folder_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.folderId')) STORED REFERENCES folders(id));
      CREATE TABLE IF NOT EXISTS candidate_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL,
        artifact_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.artifactId')) STORED NOT NULL REFERENCES artifacts(id));
      CREATE TABLE IF NOT EXISTS candidate_saves (job_id TEXT NOT NULL REFERENCES candidate_jobs(id) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, PRIMARY KEY(job_id,candidate_id));`);
    if (seed && !this.db.prepare("SELECT id FROM settings WHERE id=1").get() &&
        ["templates", "topics", "tasks", "runs"].every((table) => !this.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())) {
      if (seed.version !== 1 || !seed.settings || !Array.isArray(seed.templates) || !Array.isArray(seed.hiddenTaskTemplateIds))
        throw new Error("基础配置文件格式无效");
      this.transaction(() => {
        const ids = new Map(seed.templates.map((template) => [
          `seed:${template.key}`, this.createTemplate({ name: template.name, config: template.config }).id,
        ]));
        const config = { ...seed.settings };
        for (const template of this.all("templates")) {
          const selectedId = ids.get(template.config.taskTemplateId);
          if (selectedId) this.updateTemplate(template.id, { config: { ...template.config, taskTemplateId: selectedId } });
        }
        config.taskTemplateId = ids.get(config.taskTemplateId) ?? config.taskTemplateId;
        this.saveSettings(config);
        for (const id of seed.hiddenTaskTemplateIds) this.deleteBuiltInTemplate(id);
      });
    }
  }

  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = action();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private config(config: Partial<ResearchConfig>): ResearchConfig {
    return normalizeResearchConfig(
      restoreTaskTemplateSelection(config),
      structuredClone(this.defaults),
    );
  }
  private decode<T>(data: string): T {
    const value = JSON.parse(data);
    if (value.config) value.config = this.config(value.config);
    if (value.candidates)
      value.candidates = value.candidates.map((c: Candidate) => ({
        ...c,
        config: this.config(c.config),
      }));
    return value as T;
  }
  private all<K extends Table>(table: K): Entities[K][] {
    return this.db
      .prepare(`SELECT data FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => this.decode<Entities[K]>(row.data as string));
  }
  private get<K extends Table>(table: K, id: string): Entities[K] | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id);
    return row ? this.decode<Entities[K]>(row.data as string) : undefined;
  }
  private require<K extends Table>(table: K, id: string): Entities[K] {
    const value = this.get(table, id);
    if (!value) throw new Error(`${table} record not found: ${id}`);
    return value;
  }
  private put<K extends Table>(table: K, value: Entities[K]): Entities[K] {
    this.db
      .prepare(
        `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(value.id, JSON.stringify(value));
    return this.require(table, value.id);
  }
  private remove(table: Table, id: string) {
    this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  private tags(tags: string[]) {
    for (const id of tags) this.require("tags", id);
  }
  private named(name: string) {
    if (!name.trim()) throw new Error("Name is required");
  }
  settings(): ResearchConfig {
    const row = this.db.prepare("SELECT data FROM settings WHERE id=1").get();
    return this.config(row ? JSON.parse(row.data as string) : {});
  }
  saveSettings(config: ResearchConfig): ResearchConfig {
    const value = this.config(config);
    this.db
      .prepare(
        "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(value));
    return value;
  }
  state(): WorkbenchState {
    return {
      hiddenTaskTemplateIds: this.hiddenTaskTemplateIds(),
      candidateJobs: this.candidateJobs(),
      topics: this.all("topics").filter((topic) => !topic.startedTaskId && !topic.archived),
      tags: this.all("tags"),
      templates: this.all("templates"),
      tasks: this.all("tasks").map((task) => this.task(task.id)!),
      artifacts: this.all("artifacts"),
      folders: this.all("folders"),
      settings: this.settings(),
    };
  }
  createTag(input: Omit<Tag, "id">): Tag {
    this.named(input.name);
    return this.put("tags", { ...input, id: randomUUID() });
  }
  updateTag(id: string, patch: Partial<Omit<Tag, "id">>): Tag {
    const value = { ...this.require("tags", id), ...patch, id };
    this.named(value.name);
    return this.put("tags", value);
  }
  deleteTag(id: string) {
    this.transaction(() => {
      for (const table of ["topics", "tasks", "artifacts"] as const) {
        for (const value of this.all(table))
          this.put(table, {
            ...value,
            tags: value.tags.filter((tag) => tag !== id),
          });
      }
      for (const job of this.all("candidate_jobs"))
        this.put("candidate_jobs", {
          ...job,
          candidates: job.candidates.map((candidate) => ({
            ...candidate,
            tags: candidate.tags.filter((tag) => tag !== id),
          })),
        });
      this.remove("tags", id);
    });
  }
  createTopic(input: Omit<Topic, "id" | "createdAt" | "updatedAt">): Topic {
    this.named(input.title);
    this.tags(input.tags);
    if (input.sourceArtifactId)
      this.require("artifacts", input.sourceArtifactId);
    if (input.startedTaskId) this.require("tasks", input.startedTaskId);
    const now = new Date().toISOString();
    return this.put("topics", {
      ...input,
      config: this.config(input.config),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  }
  updateTopic(
    id: string,
    patch: Partial<Omit<Topic, "id" | "createdAt">>,
  ): Topic {
    const value = {
      ...this.require("topics", id),
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.named(value.title);
    this.tags(value.tags);
    if (value.startedTaskId) this.require("tasks", value.startedTaskId);
    if (value.sourceArtifactId)
      this.require("artifacts", value.sourceArtifactId);
    return this.put("topics", value);
  }
  deleteTopic(id: string) {
    this.transaction(() => this.removeTopicRecords(id));
  }
  private removeTopicRecords(id: string) {
    for (const task of this.all("tasks").filter(
      (task) => task.topicId === id,
    )) {
      delete task.topicId;
      this.put("tasks", task);
    }
    for (const job of this.all("candidate_jobs"))
      this.put("candidate_jobs", {
        ...job,
        candidates: job.candidates.map((candidate) => {
          if (candidate.savedTopicId === id) delete candidate.savedTopicId;
          return candidate;
        }),
      });
    this.remove("topics", id);
  }
  topic(id: string): Topic | undefined {
    return this.get("topics", id);
  }
  createTemplate(input: Pick<Template, "name" | "config">): Template {
    this.named(input.name);
    const now = new Date().toISOString();
    return this.put("templates", {
      ...input,
      id: randomUUID(),
      config: this.config(input.config),
      createdAt: now,
      updatedAt: now,
    });
  }
  updateTemplate(
    id: string,
    patch: Partial<Pick<Template, "name" | "config">>,
  ): Template {
    const value = {
      ...this.require("templates", id),
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.named(value.name);
    return this.put("templates", value);
  }
  deleteTemplate(id: string) {
    this.remove("templates", id);
  }
  private hiddenTaskTemplateIds(): string[] {
    const row = this.db.prepare("SELECT data FROM preferences WHERE key='hidden_task_templates'").get();
    return row ? JSON.parse(row.data as string) : [];
  }
  deleteBuiltInTemplate(id: string) {
    if (!TASK_TEMPLATES.some((template) => template.id === id))
      throw new Error("内置任务模板不存在");
    const ids = [...new Set([...this.hiddenTaskTemplateIds(), id])];
    this.db.prepare("INSERT INTO preferences VALUES('hidden_task_templates',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data")
      .run(JSON.stringify(ids));
  }
  private validateFolder(value: Folder) {
    this.named(value.name);
    let parentId = value.parentId;
    const visited = new Set([value.id]);
    while (parentId) {
      if (visited.has(parentId)) throw new Error("Folder cycle");
      visited.add(parentId);
      parentId = this.require("folders", parentId).parentId;
    }
  }
  createFolder(input: Omit<Folder, "id">): Folder {
    const value = { ...input, id: randomUUID() };
    this.validateFolder(value);
    return this.put("folders", value);
  }
  updateFolder(id: string, patch: Partial<Omit<Folder, "id">>): Folder {
    const value = { ...this.require("folders", id), ...patch, id };
    this.validateFolder(value);
    return this.put("folders", value);
  }
  deleteFolder(id: string) {
    this.transaction(() => {
      const remove = (folderId: string) => {
        for (const child of this.all("folders").filter(
          (folder) => folder.parentId === folderId,
        ))
          remove(child.id);
        for (const artifact of this.all("artifacts").filter(
          (artifact) => artifact.folderId === folderId,
        ))
          this.put("artifacts", { ...artifact, folderId: null });
        this.remove("folders", folderId);
      };
      remove(id);
    });
  }
  createTask(
    input: Pick<Task, "title" | "description" | "tags" | "config" | "topicId">,
  ): Task {
    this.named(input.title);
    this.tags(input.tags);
    if (input.topicId) this.require("topics", input.topicId);
    const task = this.put("tasks", {
      ...input,
      config: this.config(input.config),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    return { ...task, runs: [] };
  }
  task(id: string): Task | undefined {
    const task = this.get("tasks", id);
    if (!task) return undefined;
    const runs = this.db
      .prepare("SELECT data FROM runs WHERE task_id=? ORDER BY rowid")
      .all(id)
      .map((row) => this.decode<Run>(row.data as string));
    return { ...task, runs, latestRun: runs.at(-1) };
  }
  createRun(taskId: string, input: RunInput, requestId?: string): Run {
    this.require("tasks", taskId);
    if (!input.sessionId.trim()) throw new Error("Session ID is required");
    if (requestId) {
      const row = this.db
        .prepare("SELECT data FROM runs WHERE request_id=?")
        .get(requestId);
      if (row) {
        const run = this.decode<Run>(row.data as string);
        if (run.taskId !== taskId)
          throw new Error("Request ID belongs to another task");
        return run;
      }
    }
    const run: Run = {
      ...input,
      config: this.config(input.config),
      id: randomUUID(),
      taskId,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO runs(id,data,request_id) VALUES(?,?,?)")
      .run(run.id, JSON.stringify(run), requestId ?? null);
    return this.run(run.id)!;
  }
  run(id: string): Run | undefined {
    return this.get("runs", id);
  }
  runByRequest(requestId: string): Run | undefined {
    const row = this.db
      .prepare("SELECT data FROM runs WHERE request_id=?")
      .get(requestId);
    return row ? this.decode<Run>(row.data as string) : undefined;
  }
  candidateJobs(): CandidateJob[] {
    return this.all("candidate_jobs");
  }
  private occupied() {
    const executing = ["starting", "running", "waiting_input", "finalizing"];
    return (
      this.runs().some((run) => executing.includes(run.status)) ||
      this.candidateJobs().some((job) => executing.includes(job.status))
    );
  }
  claimRun(id: string): boolean {
    return this.transaction(() => {
      const run = this.run(id);
      if (!run || run.status !== "queued" || this.occupied()) return false;
      this.updateRun(id, {
        status: "starting",
        startedAt: new Date().toISOString(),
      });
      return true;
    });
  }
  claimCandidate(id: string): boolean {
    return this.transaction(() => {
      const job = this.candidateJob(id);
      if (!job || job.status !== "queued" || this.occupied()) return false;
      this.updateCandidateJob(id, { status: "running" });
      return true;
    });
  }
  runs(): Run[] {
    return this.all("runs");
  }
  updateRun(
    id: string,
    patch: Partial<Omit<Run, "id" | "taskId" | "createdAt">>,
  ): Run {
    const value = { ...this.require("runs", id), ...patch, id };
    if (!value.sessionId.trim()) throw new Error("Session ID is required");
    if (
      !activeStatuses.includes(value.status) &&
      !["completed", "failed", "stopped", "interrupted"].includes(value.status)
    )
      throw new Error("Invalid run status");
    return this.put("runs", value);
  }
  startTopic(
    topicId: string,
    config: ResearchConfig,
    input: Pick<Run, "sessionId" | "prompt" | "directory"> &
      Partial<Pick<Run, "config">>,
    requestId: string,
  ): Task {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT data FROM runs WHERE request_id=?")
        .get(requestId);
      if (row) {
        const run = this.decode<Run>(row.data as string);
        const task = this.task(run.taskId)!;
        if (task.topicId !== topicId)
          throw new Error("Request ID belongs to another topic");
        return task;
      }
      const topic = this.require("topics", topicId);
      if (topic.archived) throw new Error("该课题已归档");
      if (topic.startedTaskId) return this.task(topic.startedTaskId)!;
      const task = this.createTask({
        title: topic.title,
        description: topic.description,
        tags: topic.tags,
        config,
        topicId,
      });
      this.createRun(
        task.id,
        {
          ...input,
          config: {
            ...config,
            workingDirectory:
              input.config?.workingDirectory ?? config.workingDirectory,
            outputDirectory:
              input.config?.outputDirectory ?? config.outputDirectory,
          },
          kind: "research",
        },
        requestId,
      );
      this.updateTopic(topicId, { startedTaskId: task.id });
      return this.task(task.id)!;
    });
  }
  private validateArtifact(value: Artifact) {
    this.named(value.title);
    this.named(value.name);
    this.tags(value.tags);
    this.require("tasks", value.taskId);
    if (this.require("runs", value.runId).taskId !== value.taskId)
      throw new Error("Artifact run belongs to another task");
    if (value.folderId) this.require("folders", value.folderId);
    if (value.convertedFromArtifactId) {
      const source = this.require("artifacts", value.convertedFromArtifactId);
      if (source.id === value.id || source.runId !== value.runId || source.convertedFromArtifactId)
        throw new Error("Invalid conversion source");
    }
    if (value.parentArtifactId) {
      const parent = this.require("artifacts", value.parentArtifactId);
      if (parent.taskId !== value.taskId || parent.id === value.id)
        throw new Error("Invalid artifact parent");
      let ancestor: Artifact | undefined = parent;
      while (ancestor) {
        if (ancestor.id === value.id) throw new Error("Artifact cycle");
        ancestor = ancestor.parentArtifactId
          ? this.require("artifacts", ancestor.parentArtifactId)
          : undefined;
      }
    }
    const path = value.relativePath.replaceAll("\\", "/");
    if (
      !path ||
      path.includes("\0") ||
      posix.isAbsolute(path) ||
      win32.isAbsolute(path) ||
      path.split("/").includes("..") ||
      path.includes(":")
    )
      throw new Error("Artifact path must be a safe relative path");
  }
  createArtifact(input: Omit<Artifact, "id" | "createdAt">): Artifact {
    const value = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.validateArtifact(value);
    return this.put("artifacts", value);
  }
  artifact(id: string): Artifact | undefined {
    return this.get("artifacts", id);
  }
  updateArtifact(
    id: string,
    patch: Partial<Omit<Artifact, "id" | "createdAt" | "taskId" | "runId">>,
  ): Artifact {
    return this.transaction(() => {
      const value = { ...this.require("artifacts", id), ...patch, id };
      this.validateArtifact(value);
      this.put("artifacts", value);
      for (const format of this.all("artifacts").filter((item) => item.convertedFromArtifactId === id)) {
        const updated = {
          ...format,
          ...(patch.folderId !== undefined ? { folderId: value.folderId } : {}),
          ...(patch.tags !== undefined ? { tags: value.tags } : {}),
          ...(patch.title !== undefined ? { title: value.title } : {}),
          ...(patch.name !== undefined ? {
            name: value.name.replace(/\.(md|markdown|pdf)$/i, "") + posix.extname(format.relativePath),
          } : {}),
        };
        this.validateArtifact(updated);
        this.put("artifacts", updated);
      }
      return value;
    });
  }
  deleteArtifact(id: string) {
    this.transaction(() => {
      const formats = this.all("artifacts").filter((item) => item.convertedFromArtifactId === id);
      const ids = [...formats.map((item) => item.id), id];
      for (const artifactId of ids) this.guardArtifactJobs(artifactId);
      for (const artifactId of ids) this.removeArtifactRecords(artifactId);
    });
  }
  private guardArtifactJobs(id: string) {
    if (this.candidateJobs().some((job) => job.artifactId === id && activeStatuses.includes(job.status)))
      throw new Error("请等待关联的候选课题生成完成后再删除");
  }
  private removeArtifactRecords(id: string) {
    for (const artifact of this.all("artifacts").filter((item) => item.convertedFromArtifactId === id)) {
      delete artifact.convertedFromArtifactId;
      this.put("artifacts", artifact);
    }
    for (const artifact of this.all("artifacts").filter(
      (a) => a.parentArtifactId === id,
    )) {
      delete artifact.parentArtifactId;
      this.put("artifacts", artifact);
    }
    for (const topic of this.all("topics").filter(
      (topic) => topic.sourceArtifactId === id,
    )) {
      delete topic.sourceArtifactId;
      delete topic.sourceSectionIds;
      this.put("topics", topic);
    }
    for (const job of this.all("candidate_jobs").filter(
      (job) => job.artifactId === id,
    ))
      this.remove("candidate_jobs", job.id);
    this.remove("artifacts", id);
  }
  deleteTask(id: string) {
    this.transaction(() => {
      const task = this.task(id);
      if (!task) throw new Error("研究任务不存在");
      if (task.runs.some((run) => activeStatuses.includes(run.status)))
        throw new Error("请先停止任务，再删除研究记录");
      const artifacts = this.all("artifacts").filter((artifact) => artifact.taskId === id);
      for (const artifact of artifacts) this.guardArtifactJobs(artifact.id);
      for (const artifact of artifacts) this.removeArtifactRecords(artifact.id);
      for (const run of task.runs) this.remove("runs", run.id);
      for (const topic of this.all("topics").filter((topic) => topic.startedTaskId === id)) {
        delete topic.startedTaskId;
        this.put("topics", { ...topic, archived: true });
      }
      this.remove("tasks", id);
    });
  }
  createCandidateJob(artifactId: string, sourceSectionIds: string[] = []): CandidateJob {
    this.require("artifacts", artifactId);
    return this.put("candidate_jobs", {
      id: randomUUID(),
      artifactId,
      sourceSectionIds,
      status: "queued",
      candidates: [],
      createdAt: new Date().toISOString(),
    });
  }
  candidateJob(id: string): CandidateJob | undefined {
    return this.get("candidate_jobs", id);
  }
  updateCandidateJob(
    id: string,
    patch: Partial<Pick<CandidateJob, "status" | "candidates" | "error">>,
  ): CandidateJob {
    const job = { ...this.require("candidate_jobs", id), ...patch, id };
    const ids = new Set<string>();
    for (const candidate of job.candidates) {
      this.named(candidate.title);
      this.tags(candidate.tags);
      if (!candidate.id || ids.has(candidate.id))
        throw new Error("Candidate IDs must be unique");
      ids.add(candidate.id);
    }
    return this.put("candidate_jobs", job);
  }
  saveCandidates(jobId: string, candidates: Candidate[]): Topic[] {
    return this.transaction(() => {
      const job = this.require("candidate_jobs", jobId);
      const saved = candidates.map((candidate) => {
        const row = this.db
          .prepare(
            "SELECT topic_id FROM candidate_saves WHERE job_id=? AND candidate_id=?",
          )
          .get(jobId, candidate.id);
        if (row) return this.require("topics", row.topic_id as string);
        if (!candidate.id) throw new Error("Candidate ID required");
        const { id: _id, savedTopicId: _saved, ...input } = candidate;
        const topic = this.createTopic({
          ...input,
          sourceArtifactId: job.artifactId,
          sourceSectionIds: job.sourceSectionIds ?? [],
        });
        this.db
          .prepare(
            "INSERT INTO candidate_saves(job_id,candidate_id,topic_id) VALUES(?,?,?)",
          )
          .run(jobId, candidate.id, topic.id);
        const replacement = { ...candidate, savedTopicId: topic.id };
        const index = job.candidates.findIndex(
          (item) => item.id === candidate.id,
        );
        if (index < 0) job.candidates.push(replacement);
        else job.candidates[index] = replacement;
        return topic;
      });
      this.put("candidate_jobs", job);
      return saved;
    });
  }
}
