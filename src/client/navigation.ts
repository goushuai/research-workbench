const pageSections = [
  "topics",
  "tasks",
  "artifacts",
  "templates",
  "tags",
  "settings",
] as const;
export type PageSection = (typeof pageSections)[number];
export function parsePageHash(hash: string): {
  section: PageSection;
  taskId: string | null;
  artifactId?: string;
} {
  const parts = hash.replace(/^#\/?/, "").split("/");
  const section = pageSections.find((value) => value === parts[0]) ?? "topics";
  if (section === "artifacts" && parts[1] && parts.length === 2) {
    try {
      return { section, taskId: null, artifactId: decodeURIComponent(parts[1]) };
    } catch {
      return { section, taskId: null };
    }
  }
  if (section !== "tasks" || !parts[1] || parts.length !== 2)
    return { section, taskId: null };
  try {
    return { section, taskId: decodeURIComponent(parts[1]) };
  } catch {
    return { section, taskId: null };
  }
}
export function artifactPageHash(id: string) {
  return `#/artifacts/${encodeURIComponent(id)}`;
}
export function pageHash(section: PageSection, taskId?: string | null) {
  return section === "tasks" && taskId
    ? `#/tasks/${encodeURIComponent(taskId)}`
    : `#/${section}`;
}
