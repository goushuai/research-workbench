import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { trustDirectories } from "../src/server/copilot-config.js";
test("Copilot JSONC state remains readable when adding another trusted directory", () => {
  const home = mkdtempSync(join(tmpdir(), "copilot-jsonc-"));
  writeFileSync(
    join(home, "config.json"),
    '// User settings\n{ "trusted_folders": ["C:/existing"], "custom": "https://example.com", }',
  );
  trustDirectories(home, ["C:/中文 目录"]);
  const saved = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
  assert.deepEqual(saved.trusted_folders, ["C:/existing", "C:/中文 目录"]);
  assert.equal(saved.custom, "https://example.com");
});
