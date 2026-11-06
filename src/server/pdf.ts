import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { chromium } from "playwright-core";
import { reportHtml } from "../client/report.js";
import { artifactFormat } from "../shared/artifacts.js";
import type { Artifact } from "../shared/types.js";
import { safeFile } from "./lifecycle.js";
import type { Store } from "./store.js";

const conversions = new Map<string, Promise<Artifact>>();

function browserExecutable() {
  const candidates = [
    process.env.PDF_BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    chromium.executablePath(),
  ];
  const executable = candidates.find((path) => path && existsSync(path));
  if (!executable) throw new Error("PDF 转换需要本机安装 Edge 或 Chrome，也可通过 PDF_BROWSER_PATH 指定浏览器。");
  return executable;
}

const printStyle = `
  @page { size: A4; margin: 19mm 17mm; }
  * { box-sizing: border-box; }
  body { color: #20252b; font: 11pt/1.75 "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; overflow-wrap: anywhere; }
  h1 { font-size: 23pt; line-height: 1.4; margin: 0 0 22pt; }
  h2 { font-size: 16pt; border-bottom: 1px solid #ccd3da; padding-bottom: 6pt; margin-top: 24pt; }
  h3 { font-size: 13pt; margin-top: 18pt; }
  h1, h2, h3, h4 { break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  a { color: #245780; text-decoration: underline; }
  img { max-width: 100%; max-height: 235mm; object-fit: contain; break-inside: avoid; }
  pre { background: #f3f5f7; border: 1px solid #d8dee5; padding: 10pt; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { font-family: Consolas, Menlo, monospace; font-size: 9pt; }
  :not(pre) > code { background: #f3f5f7; padding: 1pt 3pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; margin: 14pt 0; }
  th, td { border: 1px solid #ccd3da; padding: 6pt; vertical-align: top; }
  th { background: #eef2f6; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  blockquote { border-left: 3px solid #8da1b6; margin: 12pt 0; padding: 2pt 12pt; color: #4a5866; }
`;

export async function renderMarkdownPdf(content: string, sourceDirectory: string): Promise<Buffer> {
  const body = reportHtml(content, "", (path) => {
    try {
      const file = safeFile(sourceDirectory, path);
      const extension = extname(file).slice(1).toLowerCase();
      const mime = extension === "jpg" ? "jpeg" : extension;
      return `data:image/${mime};base64,${readFileSync(file).toString("base64")}`;
    } catch {
      return "";
    }
  });
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'"><style>${printStyle}</style></head><body>${body}</body></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#697580"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await browser.close();
  }
}

async function createPdf(store: Store, source: Artifact): Promise<Artifact> {
  if (artifactFormat(source) !== "md") throw new Error("目前支持将 Markdown 产出物转换为 PDF");
  const run = store.run(source.runId);
  if (!run) throw new Error("来源运行不存在");
  const sourcePath = safeFile(run.directory, source.relativePath);
  const existing = store.state().artifacts.find((item) => item.convertedFromArtifactId === source.id && artifactFormat(item) === "pdf");
  if (existing) {
    try {
      safeFile(run.directory, existing.relativePath);
      return existing;
    } catch { /* Regenerate if a previously converted file is missing. */ }
  }
  const buffer = await renderMarkdownPdf(readFileSync(sourcePath, "utf8"), dirname(sourcePath));
  const current = store.artifact(source.id);
  if (!current) throw new Error("来源产出物已被删除");
  const path = join(dirname(sourcePath), `report-${randomUUID()}.pdf`);
  const temporary = path + ".tmp";
  try {
    writeFileSync(temporary, buffer, { flag: "wx" });
    renameSync(temporary, path);
    const metadata = {
      name: current.name.replace(/\.(md|markdown)$/i, "") + ".pdf",
      title: current.title,
      relativePath: relative(run.directory, path).replaceAll("\\", "/"),
      tags: current.tags,
      folderId: current.folderId,
    };
    return existing
      ? store.updateArtifact(existing.id, metadata)
      : store.createArtifact({ ...metadata, taskId: source.taskId, runId: source.runId, convertedFromArtifactId: source.id });
  } catch (error) {
    rmSync(temporary, { force: true });
    rmSync(path, { force: true });
    throw error;
  }
}

export function convertArtifactPdf(store: Store, id: string): Promise<Artifact> {
  const source = store.artifact(id);
  if (!source) throw new Error("产出物不存在");
  const pending = conversions.get(id);
  if (pending) return pending;
  const result = createPdf(store, source).finally(() => conversions.delete(id));
  conversions.set(id, result);
  return result;
}
