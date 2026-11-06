import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TASK_TEMPLATES,
  applyTaskTemplate,
} from "../src/shared/task-templates.js";
import {
  DEFAULT_CONFIG,
  buildResearchPrompt,
  validateConfig,
  normalizeModels,
} from "../src/server/models.js";
test("all built-in task templates have distinct instructions carried into the research prompt", () => {
  const prompts = new Set<string>();
  for (const template of TASK_TEMPLATES) {
    const config = applyTaskTemplate(
      { ...DEFAULT_CONFIG, model: "gpt-6-astra", reasoningEffort: "max" },
      template.id,
    );
    assert.equal(config.model, "gpt-6-astra");
    assert.equal(config.reasoningEffort, "max");
    assert.equal(config.taskInstructions, template.instructions);
    assert.equal(config.taskTemplateId, `builtin:${template.id}`);
    assert.equal(config.taskTemplateName, template.name);
    const saved = validateConfig(
      config,
      normalizeModels([{ id: config.model }]),
    );
    assert.equal(saved.taskTemplateId, config.taskTemplateId);
    assert.equal(saved.taskTemplateName, config.taskTemplateName);
    assert.ok(
      buildResearchPrompt("用户研究目标", config, "out").includes(
        template.instructions,
      ),
    );
    assert.ok(template.instructions.length > 100);
    prompts.add(template.instructions);
  }
  assert.equal(prompts.size, TASK_TEMPLATES.length);
});
test("task instructions are validated and legacy configs default to empty instructions", () => {
  const models = normalizeModels([{ id: DEFAULT_CONFIG.model }]);
  const oldConfig = validateConfig(
    {
      model: DEFAULT_CONFIG.model,
      taskInstructions: TASK_TEMPLATES[1].instructions,
    },
    models,
  );
  assert.equal(oldConfig.taskTemplateId, `builtin:${TASK_TEMPLATES[1].id}`);
  assert.equal(
    validateConfig({ model: DEFAULT_CONFIG.model }, models).taskInstructions,
    "",
  );
  assert.equal(
    validateConfig(
      { ...DEFAULT_CONFIG, taskInstructions: "  核对结论来源  " },
      models,
    ).taskInstructions,
    "核对结论来源",
  );
  assert.throws(
    () =>
      validateConfig(
        { ...DEFAULT_CONFIG, taskInstructions: "x".repeat(20001) },
        models,
      ),
    /提示词/,
  );
  assert.throws(() => applyTaskTemplate(DEFAULT_CONFIG, "missing"), /模板/);
});
