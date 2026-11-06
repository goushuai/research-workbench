import type { FollowupInput, FollowupIntent, ResearchConfig } from "./types.js";
import { normalizeResearchConfig } from "./config.js";

export const FOLLOWUP_OPTIONS = [
  {
    id: "rewrite",
    label: "重写报告",
    description: "调整表达与结构",
    requirementLabel: "重写要求",
    placeholder: "说明哪些表达、论证或章节需要调整。",
    result: "复用所选报告和资料，在原任务中生成新版本。",
  },
  {
    id: "glossary",
    label: "提取术语",
    description: "梳理概念与定义",
    requirementLabel: "术语范围与补充要求",
    placeholder: "如，只提取架构与调度相关概念，保留英文名称。",
    result: "从所选报告中提取术语，生成独立的术语说明。",
  },
  {
    id: "verify",
    label: "核验与更新",
    description: "核对观点与时效",
    requirementLabel: "重点核验的问题",
    placeholder: "列出需要核查的观点、数据或可能过时的结论。",
    result: "核对证据、标注修正与未决问题，生成核验报告。",
  },
  {
    id: "deepen",
    label: "深化问题",
    description: "保存一个深入研究方向",
    requirementLabel: "深化问题与研究范围",
    placeholder: "明确一个要继续深入的问题，以及希望验证的假设。",
    result: "保存一个待研究课题，开始研究时再使用其配置。",
  },
  {
    id: "derive",
    label: "衍生课题",
    description: "提炼多个候选问题",
    requirementLabel: "候选方向与筛选要求",
    placeholder: "如，优先提出能通过小型实验验证的工程问题。",
    result: "本次只提炼候选，勾选保存后再从课题列表启动研究。",
  },
] as const;
export const FOLLOWUP_FEEDBACK = [
  "证据不够充分",
  "解释需要更清晰",
  "增加技术细节",
  "补充最新资料",
  "扩大研究范围",
];
export const feedbackForIntent: Record<FollowupIntent, string[]> = {
  rewrite: ["解释需要更清晰", "增加技术细节", "证据不够充分"],
  verify: ["证据不够充分", "补充最新资料", "扩大研究范围"],
  glossary: [],
  deepen: [],
  derive: [],
};
export function makeFollowup(
  intent: FollowupIntent,
  config: ResearchConfig,
): FollowupInput {
  const future = intent === "derive" || intent === "deepen";
  return {
    intent,
    feedback: [],
    instructions: "",
    count: intent === "glossary" ? 20 : 3,
    glossaryDepth: "standard",
    glossaryLayout: "grouped",
    verifyScope: "key",
    asOfDate: "",
    topicTitle: "",
    sectionIds: [],
    config: normalizeResearchConfig({
      ...config,
      ...(!future
        ? {
            taskInstructions: "",
            taskTemplateId: "",
            taskTemplateName: "",
            reuseStrategy: intent === "verify" ? "refresh" : "existing_only",
          }
        : {}),
    }),
    generation: {
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      budgetMinutes: Math.min(config.budgetMinutes, 10),
    },
  };
}
export function effectiveFollowup(input: FollowupInput): FollowupInput {
  const defaults = makeFollowup(input.intent, input.config);
  const future = input.intent === "deepen" || input.intent === "derive";
  return {
    ...defaults,
    ...input,
    feedback: input.feedback.filter((value) =>
      feedbackForIntent[input.intent]?.includes(value),
    ),
    config: normalizeResearchConfig({
      ...input.config,
      ...(!future
        ? { taskInstructions: "", taskTemplateId: "", taskTemplateName: "" }
        : {}),
      ...(input.intent === "glossary"
        ? {
            reportType: "tutorial",
            depth:
              input.glossaryDepth === "technical"
                ? "deep"
                : input.glossaryDepth === "brief"
                  ? "overview"
                  : "standard",
            focusAreas: [],
            lengthPreset: "legacy",
            length: "按术语数量与解释深度",
          }
        : {}),
    }),
    generation: input.generation ?? defaults.generation,
  };
}
export function candidateExecutionConfig(input: FollowupInput): ResearchConfig {
  return {
    ...input.config,
    ...(input.generation ?? makeFollowup("derive", input.config).generation),
  };
}
