import type { ModelInfo, ResearchConfig } from "../shared/types.js";
export function switchModel(
  config: ResearchConfig,
  model: string,
  models: ModelInfo[],
): ResearchConfig {
  const supported = models.find((item) => item.id === model)
    ?.reasoningEfforts ?? ["default"];
  return {
    ...config,
    model,
    reasoningEffort: supported.includes(config.reasoningEffort)
      ? config.reasoningEffort
      : "default",
  };
}
