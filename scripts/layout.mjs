import { existsSync, mkdirSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";

export function runtimeLayout(projectRoot, env = process.env) {
  const installed = basename(projectRoot) === "app" && existsSync(join(dirname(projectRoot), "deployment.json"));
  const deploymentRoot = resolve(env.WORKBENCH_DEPLOY_DIR || (installed ? dirname(projectRoot) : `${projectRoot}-deploy`));
  const toolsRoot = join(deploymentRoot, "tools");
  return {
    projectRoot,
    deploymentRoot,
    appRoot: join(deploymentRoot, "app"),
    dataRoot: resolve(env.RESEARCH_DATA_DIR || join(deploymentRoot, "state/workbench")),
    proxyRoot: resolve(env.CLIPROXY_DATA_DIR || join(deploymentRoot, "state/cliproxyapi")),
    toolsRoot,
    cacheRoot: join(deploymentRoot, "cache"),
    temporaryRoot: join(deploymentRoot, "tmp"),
  };
}

export function runtimeEnvironment(layout, env = process.env) {
  for (const directory of [layout.cacheRoot, layout.temporaryRoot]) mkdirSync(directory, { recursive: true });
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") || "PATH";
  return {
    ...env,
    WORKBENCH_DEPLOY_DIR: layout.deploymentRoot,
    RESEARCH_DATA_DIR: layout.dataRoot,
    CLIPROXY_DATA_DIR: layout.proxyRoot,
    TMP: layout.temporaryRoot,
    TEMP: layout.temporaryRoot,
    TMPDIR: layout.temporaryRoot,
    npm_config_cache: join(layout.cacheRoot, "npm"),
    PLAYWRIGHT_BROWSERS_PATH: join(layout.toolsRoot, "browsers"),
    NODE_USE_ENV_PROXY: "1",
    [pathKey]: dirname(process.execPath) + delimiter + (env[pathKey] || ""),
    NO_PROXY: [env.NO_PROXY || "", "localhost", "127.0.0.1", "::1"].filter(Boolean).join(","),
  };
}
