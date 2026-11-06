import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveredReport } from "../src/server/delivery.js";
test("only explicitly marked complete report bodies are accepted", () => {
  const body = "# 研究报告\n\n" + "已核对的正文及来源。".repeat(15);
  assert.equal(
    deliveredReport(`<workbench_report>\n${body}\n</workbench_report>`),
    body,
  );
  assert.equal(deliveredReport("报告已保存。"), undefined);
  assert.equal(
    deliveredReport("<workbench_report>摘要</workbench_report>"),
    undefined,
  );
  assert.equal(
    deliveredReport(
      `引用如下 <workbench_report>\n${body}\n</workbench_report>`,
    ),
    undefined,
  );
});
