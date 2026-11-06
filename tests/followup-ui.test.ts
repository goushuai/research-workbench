import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigEditor } from "../src/client/App.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
import { TASK_TEMPLATES } from "../src/shared/task-templates.js";

test("deleted built-in templates are absent from new configuration choices", () => {
  const hidden = TASK_TEMPLATES[0];
  const html = renderToStaticMarkup(createElement(ConfigEditor, {
    value: DEFAULT_CONFIG, change: () => {}, models: [], hiddenTemplateIds: [hidden.id],
  }));
  assert.doesNotMatch(html, new RegExp(`value="builtin:${hidden.id}"`));
});
test("glossary settings omit report templates length emphasis and duplicate task instructions", () => {
  const html = renderToStaticMarkup(
    createElement(ConfigEditor, {
      value: DEFAULT_CONFIG,
      change: () => {},
      models: [],
      profile: "glossary",
    }),
  );
  assert.doesNotMatch(
    html,
    /从任务模板开始|任务提示词与约束|主模板|篇幅|侧重点/,
  );
  assert.match(html, /读者背景/);
  assert.match(html, /资料复用策略/);
});
test("candidate execution settings only configure this generation", () => {
  const html = renderToStaticMarkup(
    createElement(ConfigEditor, {
      value: DEFAULT_CONFIG,
      change: () => {},
      models: [],
      profile: "execution",
    }),
  );
  assert.match(html, /本次生成模型/);
  assert.match(html, /执行预算/);
  assert.doesNotMatch(
    html,
    /从任务模板开始|任务提示词与约束|读者背景|主模板|篇幅|侧重点|资料复用策略|执行权限/,
  );
});
