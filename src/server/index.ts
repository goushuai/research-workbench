import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./api.js";
import { Store } from "./store.js";
import { DEFAULT_CONFIG } from "./models.js";
import { dataRoot, ensureDirectories, projectRoot } from "./paths.js";
import { listModels } from "./proxy.js";
import { startScheduler } from "./research.js";
import type { ModelInfo } from "../shared/types.js";
import { shutdownServer } from "./lifecycle.js";
ensureDirectories();
const setupPath = join(projectRoot, "config/defaults.json");
const setup = existsSync(setupPath) ? JSON.parse(readFileSync(setupPath, "utf8")) : undefined;
const store = new Store(join(dataRoot, "workbench.sqlite"), DEFAULT_CONFIG, setup);
const cachePath = join(dataRoot, "models.json");
let cached: ModelInfo[] = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : [];
let refreshed = 0;
const catalog = async () => {
  if (Date.now() - refreshed < 60000 && cached.length) return cached;
  try {
    cached = await listModels();
    refreshed = Date.now();
    writeFileSync(cachePath, JSON.stringify(cached));
    return cached;
  } catch (error) {
    if (cached.length) return cached;
    throw error;
  }
};
const app = createApp(store, catalog);
const port = Number(process.env.PORT || 8765);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`研究工作台 http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error("启动失败", error.message);
  process.exitCode = 1;
});
const stop = startScheduler(store);
async function close() {
  stop();
  await shutdownServer(server);
  store.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
