import { normalizeResearchConfig } from "./config.js";
import type { ResearchConfig, Template } from "./types.js";

export interface PublicSetup {
  version: 1;
  settings: ResearchConfig;
  templates: { key: string; name: string; config: ResearchConfig }[];
  hiddenTaskTemplateIds: string[];
}

export function portableConfig(input: ResearchConfig, defaults: ResearchConfig): ResearchConfig {
  const normalized = normalizeResearchConfig(input, defaults);
  const config = Object.fromEntries(Object.keys(defaults).map((key) => [key, normalized[key as keyof ResearchConfig]])) as unknown as ResearchConfig;
  return { ...config, workingDirectory: "", outputDirectory: "" };
}

export function publicSetup(
  source: { settings: ResearchConfig; templates: Template[]; hiddenTaskTemplateIds: string[] },
  defaults: ResearchConfig,
): PublicSetup {
  const keys = new Map(source.templates.map((template, index) => [template.id, `template-${index + 1}`]));
  function clean(input: ResearchConfig) {
    const config = portableConfig(input, defaults);
    if (keys.has(config.taskTemplateId)) config.taskTemplateId = `seed:${keys.get(config.taskTemplateId)}`;
    else if (!config.taskTemplateId.startsWith("builtin:")) config.taskTemplateId = "";
    return config;
  }
  return {
    version: 1,
    settings: clean(source.settings),
    templates: source.templates.map((template) => ({ key: keys.get(template.id)!, name: template.name, config: clean(template.config) })),
    hiddenTaskTemplateIds: [...source.hiddenTaskTemplateIds],
  };
}
