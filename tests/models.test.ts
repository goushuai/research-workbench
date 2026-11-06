import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModels,
  validateConfig,
  buildResearchPrompt,
  constrainRequest,
  DEFAULT_CONFIG,
} from "../src/server/models.js";
test("documented GPT models expose their full reasoning levels when catalog metadata is missing", () => {
  const models = normalizeModels([
    { id: "gpt-6-luna" },
    { id: "gpt-6-astra" },
    { id: "gpt-6.1-sol" },
    { id: "gpt-6.1-terra" },
  ]);
  assert.deepEqual(models[0].reasoningEfforts, [
    "default",
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  for (const model of models) assert.ok(model.reasoningEfforts.includes("max"));
  assert.equal(models[1].reasoningEfforts.includes("none"), false);
  assert.equal(models[2].reasoningEfforts.includes("minimal"), false);
  assert.equal(models[0].capabilitySource, "documentation");
  const advertised = normalizeModels([
    { id: "gpt-6-luna", thinking: { levels: ["low", "high"] } },
  ])[0];
  assert.deepEqual(advertised.reasoningEfforts, ["default", "low", "high"]);
});

test("model catalog excludes image models and respects advertised reasoning levels", () => {
  const models = normalizeModels([
    { id: "gpt-6-luna" },
    { id: "gpt-image-2" },
    { id: "gpt-custom", thinking: { levels: ["low", "high"] } },
  ]);
  assert.deepEqual(
    models.map((m) => m.id),
    ["gpt-6-luna", "gpt-custom"],
  );
  assert.deepEqual(models[1].reasoningEfforts, ["default", "low", "high"]);
});
test("invalid model and unsupported reasoning combinations are rejected", () => {
  const catalog = normalizeModels([
    { id: "gpt-custom", thinking: { levels: ["low", "high"] } },
  ]);
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, model: "missing" }, catalog),
    /模型/,
  );
  assert.throws(
    () =>
      validateConfig(
        { ...DEFAULT_CONFIG, model: "gpt-custom", reasoningEffort: "max" },
        catalog,
      ),
    /推理/,
  );
  assert.equal(
    validateConfig(
      { ...DEFAULT_CONFIG, model: "gpt-custom", reasoningEffort: "high" },
      catalog,
    ).reasoningEffort,
    "high",
  );
});
test("outgoing research requests enforce selected model and effort including child agent requests", () => {
  assert.deepEqual(
    constrainRequest(
      {
        model: "another-model",
        reasoning: { effort: "low", summary: "auto" },
        stream: true,
      },
      { ...DEFAULT_CONFIG, model: "gpt-6-luna", reasoningEffort: "high" },
    ),
    {
      model: "gpt-6-luna",
      reasoning: { effort: "high", summary: "auto" },
      stream: true,
    },
  );
});
test("default reasoning leaves upstream effort untouched while pinning the selected model", () => {
  assert.deepEqual(
    constrainRequest(
      { model: "other", reasoning: { effort: "medium" } },
      DEFAULT_CONFIG,
    ),
    { model: DEFAULT_CONFIG.model, reasoning: { effort: "medium" } },
  );
});
test("research prompt includes evidence requirements and exact deliverable directory", () => {
  const prompt = buildResearchPrompt(
    "比较上下文压缩",
    DEFAULT_CONFIG,
    "C:/测试 目录/deliverables",
  );
  assert.match(prompt, /比较上下文压缩/);
  assert.match(prompt, /C:\/测试 目录\/deliverables/);
  assert.match(prompt, /原始来源/);
});
