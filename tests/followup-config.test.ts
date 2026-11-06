import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, buildResearchPrompt } from "../src/server/models.js";
import {
  effectiveFollowup,
  makeFollowup,
  candidateExecutionConfig,
} from "../src/shared/followup.js";
test("report transformations clear source task constraints while future topics preserve them", () => {
  const config = {
    ...DEFAULT_CONFIG,
    taskInstructions: "原任务只做源码剖析",
    taskTemplateId: "builtin:source",
    taskTemplateName: "源码剖析",
  };
  for (const intent of ["rewrite", "glossary", "verify"] as const)
    assert.equal(
      effectiveFollowup({ ...makeFollowup(intent, config), config }).config
        .taskInstructions,
      "",
    );
  for (const intent of ["derive", "deepen"] as const)
    assert.equal(
      makeFollowup(intent, config).config.taskInstructions,
      config.taskInstructions,
    );
});
test("candidate execution settings are independent from future research settings", () => {
  const input = makeFollowup("derive", DEFAULT_CONFIG);
  input.generation = {
    model: "gpt-6-luna",
    reasoningEffort: "low",
    budgetMinutes: 2,
  };
  input.config = {
    ...input.config,
    model: "gpt-6.1-sol",
    reasoningEffort: "max",
    budgetMinutes: 90,
  };
  assert.equal(candidateExecutionConfig(input).model, "gpt-6-luna");
  assert.equal(input.config.model, "gpt-6.1-sol");
});
test("glossary prompt omits inherited report style and length instructions", () => {
  const prompt = buildResearchPrompt(
    "提取20个术语",
    {
      ...DEFAULT_CONFIG,
      lengthPreset: "long",
      reportType: "source_analysis",
      taskInstructions: "原任务约束",
    },
    "out",
    "glossary",
  );
  assert.doesNotMatch(prompt, /10000|真实入口|原任务约束/);
});
