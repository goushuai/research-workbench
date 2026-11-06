import { test } from "node:test";
import assert from "node:assert/strict";
import { switchModel } from "../src/client/models.js";
import type { ModelInfo, ResearchConfig } from "../src/shared/types.js";
const config = { model: "old", reasoningEffort: "high" } as ResearchConfig;
const models: ModelInfo[] = [
  {
    id: "new",
    label: "New",
    reasoningEfforts: ["default", "low"],
    capabilitySource: "catalog",
  },
];
test("model switch resets unsupported reasoning effort to default", () => {
  assert.equal(switchModel(config, "new", models).reasoningEffort, "default");
});
test("model switch preserves supported reasoning effort and other settings", () => {
  const current = {
    ...config,
    reasoningEffort: "low" as const,
    audience: "开发者",
  };
  assert.deepEqual(switchModel(current, "new", models), {
    ...current,
    model: "new",
  });
});
test("unknown model uses default reasoning effort conservatively", () => {
  assert.equal(
    switchModel(config, "unknown", models).reasoningEffort,
    "default",
  );
});
