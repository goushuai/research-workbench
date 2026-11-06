import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TaskParameters } from "../src/client/TaskParameters.js";
import { parsePageHash, pageHash } from "../src/client/navigation.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
test("task page URLs survive refresh and distinguish list and detail routes", () => {
  assert.deepEqual(parsePageHash(pageHash("tasks", "task-123")), {
    section: "tasks",
    taskId: "task-123",
  });
  assert.deepEqual(parsePageHash("#/tasks"), {
    section: "tasks",
    taskId: null,
  });
  assert.deepEqual(parsePageHash("#/templates"), {
    section: "templates",
    taskId: null,
  });
  assert.deepEqual(parsePageHash("#/tasks/%zz"), {
    section: "tasks",
    taskId: null,
  });
});
test("launch parameters display the frozen run config and actual prompt", () => {
  const config = {
    ...DEFAULT_CONFIG,
    model: "gpt-6.1-sol",
    reasoningEffort: "medium" as const,
    taskTemplateName: "推导式理解",
    taskInstructions: "先给出朴素方案，再解释改进。",
    reportType: "derivation" as const,
    depth: "deep" as const,
    lengthPreset: "long" as const,
    length: "10000～15000 字",
    workingDirectory: "C:/project/workspace",
  };
  const run = {
    id: "run",
    taskId: "task",
    kind: "research" as const,
    status: "running" as const,
    sessionId: "session",
    prompt: "完整的启动提示词",
    directory: "C:/project/runs/run",
    createdAt: "2026-11-06T00:00:00Z",
    config,
  };
  const html = renderToStaticMarkup(
    createElement(TaskParameters, { config, run }),
  );
  for (const value of [
    "启动参数",
    "gpt-6.1-sol",
    "medium",
    "推导式理解",
    "深入推导",
    "10000～15000 字",
    "先给出朴素方案",
    "完整的启动提示词",
    "C:/project/workspace",
  ])
    assert.ok(html.includes(value), value);
});
