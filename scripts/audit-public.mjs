import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { runtimeLayout } from "./layout.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layout = runtimeLayout(root);
const excluded = new Set([".git", "node_modules", "dist", ".local-state", ".local-tools", ".superpowers"]);
function candidates(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (excluded.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? candidates(path) : [relative(root, path).replaceAll("\\", "/")];
  });
}
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true });
const files = tracked.status === 0 && tracked.stdout ? tracked.stdout.split("\0").filter(Boolean) : candidates(root);
const privateValues = new Set();
function secrets(value, field = "") {
  if (typeof value === "string" && /token|secret|password|api.?key|account.?id|email/i.test(field) && value.length >= 8)
    privateValues.add(value);
  else if (Array.isArray(value)) for (const item of value) secrets(item, field);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) secrets(item, key);
}
const roots = [layout.proxyRoot, join(root, ".local-state/cliproxyapi")];
for (const privateRoot of roots) {
  const config = join(privateRoot, "config.yaml");
  if (existsSync(config)) secrets(parse(readFileSync(config, "utf8")));
  const auth = join(privateRoot, "auth");
  if (existsSync(auth)) for (const file of readdirSync(auth).filter((name) => name.endsWith(".json"))) {
    try { secrets(JSON.parse(readFileSync(join(auth, file), "utf8"))); } catch { /* Ignore partial local credential files. */ }
  }
}
const findings = [];
for (const file of files) {
  if (/(^|\/)(\.local-state|\.local-tools|node_modules|auth|dist)(\/|$)|(^|\/)\.env($|\.)|\.(sqlite(?:-\w+)?|db|pem|key|log)$/i.test(file)) {
    findings.push({ file, rule: "runtime-or-credential-file" });
    continue;
  }
  const indexed = tracked.status === 0 && tracked.stdout
    ? spawnSync("git", ["show", `:${file}`], { cwd: root, encoding: "utf8", windowsHide: true })
    : undefined;
  if (indexed && indexed.status !== 0) throw new Error(`无法读取暂存文件 ${file}`);
  const content = indexed ? indexed.stdout : readFileSync(join(root, file), "utf8");
  const checks = [
    ["credential-token", /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{15,})\b/],
    ["personal-home-path", /(?:[A-Z]:[\\/]+Users[\\/]+(?!<|Public\b|Default\b)[^\\/\s"']+|\/Users\/(?!<)[^/\s"']+)/i],
    ["private-shared-chat", /https:\/\/chatgpt\.com\/s\/[A-Za-z0-9_]+/],
    ["embedded-url-credential", /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
  ];
  for (const [rule, pattern] of checks) if (pattern.test(content)) findings.push({ file, rule });
  for (const secret of privateValues) if (content.includes(secret)) {
    findings.push({ file, rule: "known-local-private-value" });
    break;
  }
}
if (findings.length) {
  console.error(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
} else console.log(`公开文件审计通过，共检查 ${files.length} 个文件。`);
