import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { runtimeLayout, runtimeEnvironment } from "../../scripts/layout.mjs";
export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const layout = runtimeLayout(projectRoot);
export const { deploymentRoot, dataRoot, proxyRoot, toolsRoot } = layout;
Object.assign(process.env, runtimeEnvironment(layout));
export const copilotHome = join(dataRoot, "copilot");
export const copilotExe =
  process.env.COPILOT_PATH ||
  join(toolsRoot, `copilot/node_modules/@github/copilot-${process.platform}-${process.arch}/copilot${process.platform === "win32" ? ".exe" : ""}`);
export const proxyExe =
  process.env.CLIPROXY_PATH ||
  join(toolsRoot, `cliproxyapi/8.0.57/cli-proxy-api${process.platform === "win32" ? ".exe" : ""}`);
export function ensureDirectories() {
  for (const folder of [
    dataRoot,
    copilotHome,
    join(dataRoot, "runs"),
    join(dataRoot, "logs"),
  ])
    mkdirSync(folder, { recursive: true });
}
