import { marked } from "marked";

export interface ReportSection {
  id: string;
  title: string;
  level: number;
  start: number;
  end: number;
}

export function reportSections(report: string): ReportSection[] {
  const sections: ReportSection[] = [];
  let cursor = 0;
  for (const token of marked.lexer(report)) {
    const start = report.indexOf(token.raw, cursor);
    if (start < 0) continue;
    cursor = start + token.raw.length;
    if (token.type === "heading") {
      sections.push({
        id: `section-${sections.length}`,
        title: token.text,
        level: token.depth,
        start,
        end: report.length,
      });
    }
  }
  return sections.map((section, index) => ({
    ...section,
    end: sections.slice(index + 1).find((next) => next.level <= section.level)?.start ?? report.length,
  }));
}

export function selectedReportScope(report: string, ids: string[] = []) {
  if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== "string"))
    throw new Error("所选章节格式无效");
  if (!ids.length) return { titles: [] as string[], content: report };
  const all = reportSections(report);
  if (ids.some((id) => !all.some((section) => section.id === id)))
    throw new Error("所选章节已失效，请重新选择");
  const selected = all.filter((section) => ids.includes(section.id));
  const roots = selected.filter((section) => !selected.some((parent) =>
    parent.start < section.start && parent.end >= section.end,
  ));
  return {
    titles: roots.map((section) => section.title),
    content: roots.map((section) => report.slice(section.start, section.end).trim()).join("\n\n"),
  };
}
