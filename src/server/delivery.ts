export function deliveredReport(content: string): string | undefined {
  const match = content
    .trim()
    .match(/^<workbench_report>\s*\n([\s\S]+)\n\s*<\/workbench_report>$/);
  const body = match?.[1]?.trim();
  if (!body || body.length < 80 || !/^#\s+\S/.test(body)) return undefined;
  return body;
}
