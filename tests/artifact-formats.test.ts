import test from "node:test";
import assert from "node:assert/strict";
import { artifactFormat, readableArtifacts, primaryArtifacts } from "../src/shared/artifacts.js";
import { parsePageHash, artifactPageHash } from "../src/client/navigation.js";
import type { Artifact } from "../src/shared/types.js";

test("artifact reader URLs survive refresh and format comes from actual path", () => {
  assert.equal(parsePageHash(artifactPageHash("report 1")).artifactId, "report 1");
  assert.equal(artifactFormat({ relativePath: "deliverables/report.MD" }), "md");
  assert.equal(artifactFormat({ relativePath: "deliverables/report.pdf" }), "pdf");
});

test("converted PDF is associated with its exact source version", () => {
  const md = { id: "md", relativePath: "report.md" } as Artifact;
  const pdf = { id: "pdf", relativePath: "report.pdf", convertedFromArtifactId: "md" } as Artifact;
  const other = { id: "other", relativePath: "other.pdf" } as Artifact;
  assert.deepEqual(readableArtifacts(md, [md, pdf, other]).map((item) => item.id), ["md", "pdf"]);
  assert.deepEqual(primaryArtifacts([md, pdf, other]).map((item) => item.id), ["md", "other"]);
  assert.deepEqual(primaryArtifacts([pdf, other]).map((item) => item.id), ["pdf", "other"]);
});
