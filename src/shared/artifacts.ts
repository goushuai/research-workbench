import type { Artifact } from "./types.js";

export function artifactFormat(artifact: Pick<Artifact, "relativePath">): string {
  const extension = artifact.relativePath.split(".").pop()?.toLowerCase() ?? "";
  return extension === "markdown" ? "md" : extension;
}

export function primaryArtifacts(artifacts: Artifact[]): Artifact[] {
  const ids = new Set(artifacts.map((artifact) => artifact.id));
  return artifacts.filter((artifact) =>
    !artifact.convertedFromArtifactId || !ids.has(artifact.convertedFromArtifactId),
  );
}

export function readableArtifacts(source: Artifact, artifacts: Artifact[]): Artifact[] {
  const original = artifacts.find((item) => item.id === source.convertedFromArtifactId) ?? source;
  return [original, ...artifacts.filter((item) => item.convertedFromArtifactId === original.id)]
    .filter((item) => ["md", "pdf"].includes(artifactFormat(item)));
}
