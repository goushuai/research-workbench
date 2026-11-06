import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
import { reconcileWorkers } from "../src/server/workers.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("stale heartbeat preserves a live runner and releases only a confirmed dead runner", () => {
  const store = new Store(":memory:", DEFAULT_CONFIG);
  try {
    const task = store.createTask({
      title: "x",
      description: "x",
      tags: [],
      config: DEFAULT_CONFIG,
    });
    const directory = mkdtempSync(join(tmpdir(), "worker-"));
    const run = store.createRun(task.id, {
      kind: "research",
      config: DEFAULT_CONFIG,
      sessionId: "s",
      prompt: "x",
      directory,
    });
    store.updateRun(run.id, { status: "running", pid: 123 });
    reconcileWorkers(store, Date.now() + 120000, () => true);
    assert.equal(store.run(run.id)?.status, "running");
    reconcileWorkers(store, Date.now() + 120000, () => false);
    assert.equal(store.run(run.id)?.status, "interrupted");
  } finally {
    store.close();
  }
});
test("candidate crashes are reconciled while the server remains running", () => {
  const store = new Store(":memory:", DEFAULT_CONFIG);
  try {
    const task = store.createTask({
      title: "x",
      description: "x",
      tags: [],
      config: DEFAULT_CONFIG,
    });
    const run = store.createRun(task.id, {
      kind: "research",
      config: DEFAULT_CONFIG,
      sessionId: "s",
      prompt: "x",
      directory: "x",
    });
    store.updateRun(run.id, { status: "completed" });
    const artifact = store.createArtifact({
      taskId: task.id,
      runId: run.id,
      title: "x",
      name: "x.md",
      relativePath: "deliverables/x.md",
      folderId: null,
      tags: [],
    });
    const job = store.createCandidateJob(artifact.id);
    store.updateCandidateJob(job.id, { status: "running" });
    reconcileWorkers(store, Date.now() + 120000, () => false);
    assert.equal(store.candidateJob(job.id)?.status, "interrupted");
  } finally {
    store.close();
  }
});
