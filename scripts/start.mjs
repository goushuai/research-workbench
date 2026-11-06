import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeLayout, runtimeEnvironment } from "./layout.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layout = runtimeLayout(root);
const env = runtimeEnvironment(layout);
if (root !== layout.appRoot) {
  const entry = join(layout.appRoot, "scripts/start.mjs");
  if (!existsSync(entry)) throw new Error("请先运行 Install.cmd 或 bash install.sh 完成部署");
  const manifest = JSON.parse(readFileSync(join(layout.deploymentRoot, "deployment.json"), "utf8"));
  const result = spawnSync(manifest.node || process.execPath, [entry], { env, stdio: "inherit", windowsHide: true });
  process.exit(result.status ?? 1);
}
const data = layout.dataRoot;
const url = `http://127.0.0.1:${process.env.PORT || 8765}`;
async function ready() {
  try {
    const response = await fetch(url + "/api/state", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
if (await ready()) {
  console.log(`研究工作台已运行 ${url}`);
  process.exit(0);
}
if (!existsSync(join(root, "dist/index.html")))
  throw new Error("请先运行 npm install 和 npm run build");
mkdirSync(join(data, "logs"), { recursive: true });
const out = openSync(join(data, "logs/server.log"), "a");
const child = spawn(
  process.execPath,
  ["--import", "tsx", join(root, "src/server/index.ts")],
  {
    cwd: root,
    env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, out],
  },
);
child.unref();
closeSync(out);
for (let attempt = 0; attempt < 40; attempt++) {
  if (await ready()) {
    console.log(`研究工作台 ${url}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
throw new Error(`服务启动超时，请查看 ${join(data, "logs/server.log")}`);
