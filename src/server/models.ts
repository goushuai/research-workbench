import type {
  Effort,
  ModelInfo,
  ResearchConfig,
  Style,
  RunKind,
} from "../shared/types.js";
import {
  CONFIG_OPTIONS,
  CONFIG_DEFAULTS,
  normalizeResearchConfig,
} from "../shared/config.js";
import { restoreTaskTemplateSelection } from "../shared/task-templates.js";

export const DEFAULT_CONFIG: ResearchConfig = {
  ...CONFIG_DEFAULTS,
  focusAreas: [...CONFIG_DEFAULTS.focusAreas],
  model: "gpt-6-luna",
  reasoningEffort: "default",
  styles: ["technical", "comparison"],
  audience: "",
  length: "4000～6000 字",
  workingDirectory: "",
  outputDirectory: "",
  budgetMinutes: 60,
  permission: "limited",
  format: "markdown",
};
const allEfforts: Effort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
// Official model pages checked on 2026-11-06. Explicit provider metadata takes precedence.
const fullGptEfforts: Effort[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const reasoningGptEfforts: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const documentedEfforts: Record<string, Effort[]> = {
  "gpt-6-luna": fullGptEfforts,
  "gpt-6-sol": fullGptEfforts,
  "gpt-6.1-terra": fullGptEfforts,
  "gpt-5.6-sol": fullGptEfforts,
  "gpt-5.6-luna": fullGptEfforts,
  "gpt-5.6-terra": fullGptEfforts,
  "gpt-6-astra": reasoningGptEfforts,
  "gpt-6.1-sol": reasoningGptEfforts,
};
const styleDescriptions: Record<Style, string> = {
  concise: "摘要最多三条核心结论，正文保留分析深度。",
  tutorial: "首次解释术语，先直觉再机制，用同一个案例逐步展开。",
  technical: "深入机制、源码、异常路径、边界条件和代价，提供可核验位置。",
  comparison: "在一致维度比较方案，说明适用条件与取舍。",
  literature: "以原始论文为依据，区分全文与摘要阅读，注明实验条件与覆盖缺口。",
};
export function normalizeModels(values: unknown[]): ModelInfo[] {
  const result: ModelInfo[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, any>;
    const id = row.id ?? row.slug;
    if (
      typeof id !== "string" ||
      !id.startsWith("gpt-") ||
      /image|audio|realtime|transcribe|tts/i.test(id) ||
      seen.has(id)
    )
      continue;
    const advertised = row.thinking?.levels ?? row.supported_reasoning_efforts;
    const levels = Array.isArray(advertised)
      ? allEfforts.filter((level) => advertised.includes(level))
      : (documentedEfforts[id] ?? (["low", "medium", "high"] as Effort[]));
    result.push({
      id,
      label: row.display_name ?? id,
      reasoningEfforts: ["default", ...levels],
      capabilitySource: Array.isArray(advertised)
        ? "catalog"
        : documentedEfforts[id]
          ? "documentation"
          : "conservative",
    });
    seen.add(id);
  }
  return result;
}
export function validateConfig(
  input: unknown,
  models: ModelInfo[],
): ResearchConfig {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("研究配置格式不正确");
  const merged = normalizeResearchConfig(
    restoreTaskTemplateSelection(input as Partial<ResearchConfig>),
    DEFAULT_CONFIG,
  );
  if (
    typeof merged.taskInstructions !== "string" ||
    merged.taskInstructions.length > 20000
  )
    throw new Error("任务提示词最多 20000 字");
  if (
    typeof merged.taskTemplateId !== "string" ||
    merged.taskTemplateId.length > 200 ||
    typeof merged.taskTemplateName !== "string" ||
    merged.taskTemplateName.length > 200
  )
    throw new Error("任务模板信息无效");
  for (const [field, options] of Object.entries(CONFIG_OPTIONS)) {
    const value = merged[field as keyof ResearchConfig];
    if (field === "lengthPreset" && value === "legacy") continue;
    const values = field === "focusAreas" ? value : [value];
    if (
      !Array.isArray(values) ||
      values.some((item) => !options.some((option) => option.id === item))
    )
      throw new Error("研究配置选项无效");
  }
  const model = models.find((item) => item.id === merged.model);
  if (!model) throw new Error("请选择模型目录中可用的模型");
  if (!model.reasoningEfforts.includes(merged.reasoningEffort))
    throw new Error("该模型不支持所选推理等级，请重新选择");
  if (
    !Array.isArray(merged.styles) ||
    merged.styles.some((style) => !(style in styleDescriptions))
  )
    throw new Error("输出风格无效");
  if (
    !Number.isInteger(merged.budgetMinutes) ||
    merged.budgetMinutes < 1 ||
    merged.budgetMinutes > 1440
  )
    throw new Error("运行预算需要为 1～1440 分钟");
  if (
    !["limited", "full"].includes(merged.permission) ||
    merged.format !== "markdown"
  )
    throw new Error("权限或输出格式无效");
  for (const field of [
    "audience",
    "length",
    "workingDirectory",
    "outputDirectory",
  ] as const)
    if (typeof merged[field] !== "string" || merged[field].length > 4000)
      throw new Error("研究配置字段无效");
  return {
    taskTemplateId: merged.taskTemplateId,
    taskTemplateName: merged.taskTemplateName.trim(),
    taskInstructions: merged.taskInstructions.trim(),
    reportType: merged.reportType,
    depth: merged.depth,
    lengthPreset: merged.lengthPreset,
    focusAreas: [...new Set(merged.focusAreas)],
    readerRole: merged.readerRole,
    familiarity: merged.familiarity,
    sourcePreference: merged.sourcePreference,
    reuseStrategy: merged.reuseStrategy,
    model: merged.model,
    reasoningEffort: merged.reasoningEffort,
    styles: [...new Set(merged.styles)],
    audience: merged.audience.trim(),
    length: merged.length.trim(),
    workingDirectory: "",
    outputDirectory: "",
    budgetMinutes: merged.budgetMinutes,
    permission: merged.permission,
    format: "markdown",
  };
}
export function constrainRequest(
  request: Record<string, unknown>,
  config: ResearchConfig,
): Record<string, unknown> {
  const result = { ...request, model: config.model };
  if (config.reasoningEffort !== "default") {
    const reasoning =
      request.reasoning && typeof request.reasoning === "object"
        ? request.reasoning
        : {};
    Object.assign(result, {
      reasoning: { ...reasoning, effort: config.reasoningEffort },
    });
  }
  return result;
}
export function buildResearchPrompt(
  goal: string,
  config: ResearchConfig,
  output: string,
  kind: RunKind = "research",
): string {
  const normalized = normalizeResearchConfig(config, DEFAULT_CONFIG);
  const transformation = ["rewrite", "glossary", "verify"].includes(kind);
  const omitted =
    kind === "glossary"
      ? ["reportType", "lengthPreset", "depth", "focusAreas"]
      : kind === "verify"
        ? ["reportType"]
        : [];
  const configurationPrompts = Object.entries(CONFIG_OPTIONS).flatMap(
    ([field, options]) => {
      if (omitted.includes(field)) return [];
      const selected = normalized[field as keyof ResearchConfig];
      const values = Array.isArray(selected) ? selected : [selected];
      return options
        .filter((option) => values.includes(option.id as never))
        .map((option) => option.prompt);
    },
  );
  return [
    goal.trim(),
    "",
    "请按以下研究配置完成资料阅读、分析与完整正文交付。研究深度和模型推理等级分别生效。",
    !transformation && normalized.taskInstructions
      ? `任务模板约束\n${normalized.taskInstructions}`
      : "",
    ...configurationPrompts,
    normalized.audience ? `读者补充背景 ${normalized.audience}` : "",
    kind !== "glossary"
      ? `正文目标篇幅 ${normalized.length}。证据不足时说明缺口，不为凑篇幅虚构内容。`
      : "术语解释的规模以本轮数量与解释深度为准。",
    "关键结论提供原始来源，区分证据、推断与待验证项。遇到资料缺失请记录缺口并继续可完成的部分。",
    "最终交付完整 Markdown 正文，开头使用文章标题。",
    `最终报告由工作台保存到 ${output}/report.md。最终回复全文使用 <workbench_report> 和 </workbench_report> 各占一行包裹，无需使用文件工具写入报告。随附图片放在同一交付目录的 assets 中。`,
    "下载源码、临时笔记和中间资料放在工作区的 materials 目录。完成正文后再总结报告位置。",
  ].join("\n");
}
