import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  buildResearchPrompt,
  validateConfig,
  normalizeModels,
} from "../src/server/models.js";
import {
  CONFIG_OPTIONS,
  normalizeResearchConfig,
} from "../src/shared/config.js";
test("each research enumeration contributes its own prompt", () => {
  for (const [field, options] of Object.entries(CONFIG_OPTIONS)) {
    for (const option of options) {
      const config = {
        ...DEFAULT_CONFIG,
        [field]: field === "focusAreas" ? [option.id] : option.id,
      };
      assert.ok(
        buildResearchPrompt("测试目标", config, "deliverables").includes(
          option.prompt,
        ),
        `${field}/${option.id}`,
      );
    }
  }
});
test("legacy settings migrate without losing their model, custom length or reader notes", () => {
  const config = normalizeResearchConfig({
    model: "gpt-old",
    styles: ["literature"],
    length: "1234 字",
    audience: "熟悉统计学",
  });
  assert.equal(config.reportType, "literature");
  assert.equal(config.lengthPreset, "legacy");
  assert.equal(config.length, "1234 字");
  assert.equal(config.audience, "熟悉统计学");
  assert.equal(config.model, "gpt-old");
});
test("new enums reject invalid values and preset lengths are authoritative", () => {
  const models = normalizeModels([{ id: DEFAULT_CONFIG.model }]);
  for (const field of Object.keys(CONFIG_OPTIONS)) {
    assert.throws(
      () =>
        validateConfig(
          {
            ...DEFAULT_CONFIG,
            [field]: field === "focusAreas" ? ["unknown"] : "unknown",
          },
          models,
        ),
      /配置|选项/,
    );
  }
  const value = validateConfig(
    {
      ...DEFAULT_CONFIG,
      lengthPreset: "long",
      length: "1字",
      workingDirectory: "C:/external",
      outputDirectory: "C:/external",
    },
    models,
  );
  assert.equal(value.length, "10000～15000 字");
  assert.equal(value.workingDirectory, "");
  assert.equal(value.outputDirectory, "");
});
