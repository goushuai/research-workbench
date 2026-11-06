import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
test("research slot claims serialize unrelated sessions", () => {
  const store = new Store(":memory:", DEFAULT_CONFIG);
  try {
    const task = store.createTask({
      title: "x",
      description: "x",
      tags: [],
      config: DEFAULT_CONFIG,
    });
    const a = store.createRun(task.id, {
      kind: "research",
      config: DEFAULT_CONFIG,
      sessionId: "a",
      prompt: "x",
      directory: "a",
    });
    const b = store.createRun(task.id, {
      kind: "research",
      config: DEFAULT_CONFIG,
      sessionId: "b",
      prompt: "x",
      directory: "b",
    });
    assert.equal(store.claimRun(a.id), true);
    assert.equal(store.claimRun(b.id), false);
    store.updateRun(a.id, { status: "completed" });
    assert.equal(store.claimRun(b.id), true);
  } finally {
    store.close();
  }
});
