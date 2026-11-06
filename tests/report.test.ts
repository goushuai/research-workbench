import { test } from "node:test";
import assert from "node:assert/strict";
import { reportHtml } from "../src/client/report.js";
test("report images use the protected local resource route", () => {
  const html = reportHtml("![图](assets/test.png)", "report-id");
  assert.match(
    html,
    /\/api\/artifacts\/report-id\/resource\?path=assets%2Ftest.png/,
  );
});
test("report rejects remote and escaping images and embedded HTML", () => {
  for (const path of [
    "https://example.com/a.png",
    "../a.png",
    "/a.png",
    "data:image/png;base64,x",
  ]) {
    assert.doesNotMatch(reportHtml(`![图](${path})`, "id"), /<img/);
  }
  assert.doesNotMatch(
    reportHtml('<img src="https://example.com/a.png">', "id"),
    /<img/,
  );
});

test("rendered reports keep safe links and reject executable link protocols", () => {
  assert.match(reportHtml("[来源](https://example.com)", "id"), /href="https:\/\/example.com"/);
  assert.doesNotMatch(reportHtml("[链接](javascript:alert%281%29)", "id"), /href=/);
  assert.doesNotMatch(reportHtml("[链接](data:text\/html,test)", "id"), /href=/);
});
