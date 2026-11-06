import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
export function trustDirectories(home: string, directories: string[]) {
  const path = join(home, "config.json");
  const errors: ParseError[] = [];
  const current = existsSync(path)
    ? parse(readFileSync(path, "utf8"), errors, { allowTrailingComma: true })
    : {};
  if (
    errors.length ||
    !current ||
    typeof current !== "object" ||
    Array.isArray(current)
  )
    throw new Error("Copilot 配置无法解析，请检查独立会话配置");
  const trusted = Array.isArray(current.trusted_folders)
    ? current.trusted_folders.filter(
        (value: unknown) => typeof value === "string",
      )
    : [];
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...current,
        trusted_folders: [...new Set([...trusted, ...directories])],
      },
      null,
      2,
    ),
  );
}
