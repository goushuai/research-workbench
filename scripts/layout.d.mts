export interface RuntimeLayout {
  projectRoot: string;
  deploymentRoot: string;
  appRoot: string;
  dataRoot: string;
  proxyRoot: string;
  toolsRoot: string;
  cacheRoot: string;
  temporaryRoot: string;
}
export function runtimeLayout(projectRoot: string, env?: NodeJS.ProcessEnv): RuntimeLayout;
export function runtimeEnvironment(layout: RuntimeLayout, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
