import test from "node:test";
import assert from "node:assert/strict";
import { reportSections, selectedReportScope } from "../src/shared/report-sections.js";

const report = "# 报告\n\n引言\n\n## 架构\n架构正文\n\n### 调度\n调度正文\n\n```md\n## 代码里的标题\n```\n\n## 实验\n实验正文\n\n架构\n---\n另一章节\n";

test("report sections respect Markdown headings and include subsections", () => {
  const sections = reportSections(report);
  assert.deepEqual(sections.map((item) => item.title), ["报告", "架构", "调度", "实验", "架构"]);
  const scope = selectedReportScope(report, [sections[1].id, sections[2].id]);
  assert.match(scope.content, /架构正文/);
  assert.match(scope.content, /调度正文/);
  assert.doesNotMatch(scope.content, /实验正文|另一章节/);
  assert.equal(scope.content.match(/调度正文/g)?.length, 1);
  assert.throws(() => selectedReportScope(report, ["missing"]), /章节/);
  assert.equal(selectedReportScope(report, []).content, report);
});
