import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Store } from "../src/server/store.js";
import { DEFAULT_CONFIG } from "../src/server/models.js";
import { dataRoot, projectRoot } from "../src/server/paths.js";
import { publicSetup } from "../src/shared/setup.js";

const { values } = parseArgs({ options: { database: { type: "string" }, output: { type: "string" } } });
const store = new Store(resolve(values.database || join(dataRoot, "workbench.sqlite")), DEFAULT_CONFIG);
try {
  const setup = publicSetup(store.state(), DEFAULT_CONFIG);
  const output = resolve(values.output || join(projectRoot, "config/defaults.json"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(setup, null, 2) + "\n");
  console.log(`已导出基础配置，包含 ${setup.templates.length} 个自定义模板。`);
} finally {
  store.close();
}
