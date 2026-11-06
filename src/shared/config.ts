import type { ResearchConfig } from "./types.js";

export const REPORT_OPTIONS = [
  {
    id: "derivation",
    label: "推导式教程",
    prompt:
      "以理解机制为主线，按具体问题出现、最简单的尝试、失败或不足、改进设计逐步推导。贯穿同一案例，说明每步设计的动机、假设与成立条件。",
  },
  {
    id: "tutorial",
    label: "入门教程",
    prompt:
      "从读者已有知识出发，首次出现时解释术语，通过一个完整案例建立直觉，再讲核心机制、常见误区与练习验证路径。",
  },
  {
    id: "selection",
    label: "方案选型",
    prompt:
      "先明确需求、约束和决策标准，在统一维度比较候选方案，给出有条件的推荐、淘汰理由、成本及切换条件，避免脱离场景的排名。",
  },
  {
    id: "industry",
    label: "行业综述",
    prompt:
      "梳理行业边界、价值链、主要参与者、商业模式、技术路线、发展阶段与趋势。注明数据时间和统计口径，区分公开事实、机构预测和自身推断。",
  },
  {
    id: "development",
    label: "开发研究",
    prompt:
      "围绕开发目标梳理需求、架构、关键接口、依赖与技术难点，比较可行实现，给出验证原型、异常处理、测试及落地建议。",
  },
  {
    id: "source_analysis",
    label: "源码剖析",
    prompt:
      "明确代码仓库、版本或提交，沿真实入口、调用链、数据结构和状态变化解释实现，引用文件与行号，分析关键分支、异常路径、性能和设计取舍。未读源码处明确标注。",
  },
  {
    id: "literature",
    label: "文献综述",
    prompt:
      "围绕研究问题组织原始论文，交代检索范围与筛选标准，按方法谱系比较假设、数据、实验条件、结论及局限，区分摘要阅读和全文阅读，指出证据冲突与研究空白。",
  },
  {
    id: "implementation",
    label: "实施指南",
    prompt:
      "按前置条件、准备、分阶段实施、配置示例、验证验收、故障排查和回滚组织正文。说明每步输入输出、依赖和风险，使读者能够照着操作并检查结果。",
  },
  {
    id: "debug_audit",
    label: "Bug 与性能审查",
    prompt:
      "从可复现症状与测量基线出发，追踪根因、影响范围和性能瓶颈，用证据验证假设，比较修复方案，列出回归检查、边界条件和优化代价。",
  },
  {
    id: "tracking",
    label: "专题追踪",
    prompt:
      "交代专题背景和时间边界，沿时间线梳理关键变化、版本和争议，核对新增证据，解释相对已有结论的变化，给出后续观察指标。",
  },
] as const;
export const DEPTH_OPTIONS = [
  {
    id: "overview",
    label: "概览",
    prompt:
      "研究深度采用概览。覆盖全局框架、关键概念、代表性事实和适用边界，优先帮助读者建立地图，核心结论仍需有来源。",
  },
  {
    id: "standard",
    label: "标准",
    prompt:
      "研究深度采用标准。解释关键机制、因果关系与主要取舍，提供代表性案例和可核验证据，分析重要异常与局限。",
  },
  {
    id: "deep",
    label: "深入推导",
    prompt:
      "研究深度采用深入推导。逐步展开问题、假设、推理过程与结论，解释朴素方案为何不足以及改进如何产生，追踪实现细节、反例、边界条件和验证过程。",
  },
] as const;
export const LENGTH_OPTIONS = [
  {
    id: "brief",
    label: "短篇 · 1000～2000 字",
    value: "1000～2000 字",
    prompt:
      "正文目标为 1000～2000 字，集中说明核心问题、依据与结论，合并重复论述。",
  },
  {
    id: "standard",
    label: "中篇 · 2000～4000 字",
    value: "2000～4000 字",
    prompt:
      "正文目标为 2000～4000 字，完整覆盖主要问题，给出必要案例与关键证据。",
  },
  {
    id: "detailed",
    label: "详篇 · 4000～6000 字",
    value: "4000～6000 字",
    prompt:
      "正文目标为 4000～6000 字，系统展开机制、比较、案例与验证，保证章节之间连贯。",
  },
  {
    id: "long",
    label: "长篇 · 1～1.5 万字",
    value: "10000～15000 字",
    prompt:
      "正文目标为 10000～15000 字，充分展开推导、原始证据、完整案例和边界分析，避免以提纲或摘要替代正文。",
  },
  {
    id: "comprehensive",
    label: "系统长文 · 2～3 万字",
    value: "20000～30000 字",
    prompt:
      "正文目标为 20000～30000 字，按清晰知识结构分章论述，包含系统证据、完整推导与可验证案例，控制重复并保持术语一致。",
  },
] as const;
export const FOCUS_OPTIONS = [
  {
    id: "mechanism",
    label: "机制",
    prompt: "侧重点为机制，解释组成、数据流、状态变化、因果关系和设计动机。",
  },
  {
    id: "comparison",
    label: "对比",
    prompt:
      "侧重点为对比，采用一致指标、相同假设与工作负载比较差异，明确适用条件。",
  },
  {
    id: "implementation",
    label: "实施",
    prompt:
      "侧重点为实施，提供步骤、接口或配置示例、验收方式、常见问题与回滚路径。",
  },
  {
    id: "evidence",
    label: "证据",
    prompt:
      "侧重点为证据，优先核对一手资料，交代来源版本、测量条件、可信度及相互冲突的证据。",
  },
  {
    id: "cost",
    label: "成本",
    prompt:
      "侧重点为成本，拆解资源、时间、费用、运维和迁移成本，注明估算假设和计价时间。",
  },
  {
    id: "risk",
    label: "风险与边界",
    prompt:
      "侧重点为风险与边界，分析失败模式、反例、约束、依赖和缓解措施，说明结论失效的条件。",
  },
  {
    id: "performance",
    label: "性能",
    prompt:
      "侧重点为性能，关注延迟、吞吐、资源占用和规模效应，核对基准测试条件，给出可复现实测路径。",
  },
  {
    id: "evolution",
    label: "演进",
    prompt:
      "侧重点为演进，解释历史问题、设计变化、版本差异和未来方向，区分已发生变化与预测。",
  },
] as const;
export const READER_OPTIONS = [
  {
    id: "general",
    label: "通用读者",
    prompt:
      "读者为通用读者。减少前置知识假设，用直观案例解释专业术语和问题价值。",
  },
  {
    id: "engineer",
    label: "工程师",
    prompt:
      "读者为工程师。可以使用编程和系统设计概念，优先连接机制、接口、实现与调试验证。",
  },
  {
    id: "researcher",
    label: "研究人员",
    prompt:
      "读者为研究人员。明确研究问题、方法假设、证据强度、实验可比性与可复现性。",
  },
  {
    id: "decision_maker",
    label: "决策与管理者",
    prompt:
      "读者为决策与管理者。围绕目标、决策条件、价值、风险、成本和落地影响组织说明。",
  },
  {
    id: "student",
    label: "学习者",
    prompt:
      "读者为学习者。按知识依赖逐层展开，用例子、阶段小结和可操作练习帮助建立理解。",
  },
] as const;
export const FAMILIARITY_OPTIONS = [
  {
    id: "beginner",
    label: "主题入门",
    prompt:
      "读者对主题处于入门阶段。先补齐必需概念，解释术语，显式连接前后推理，避免跳步。",
  },
  {
    id: "familiar",
    label: "已有基础",
    prompt:
      "读者已有主题基础。简述背景后直接进入关键机制与取舍，解释容易混淆的细节。",
  },
  {
    id: "advanced",
    label: "熟悉主题",
    prompt:
      "读者已熟悉主题。压缩基础介绍，重点分析深层机制、争议、边界和新增认识。",
  },
] as const;
export const SOURCE_OPTIONS = [
  {
    id: "mixed",
    label: "综合资料",
    prompt:
      "来源采用综合资料，综合官方文档、原始论文、源码与可信实践，交叉核对重要结论。",
  },
  {
    id: "official",
    label: "官方文档与标准",
    prompt:
      "来源优先官方文档、协议标准和维护者说明，注明版本与发布日期，第三方解释仅作补充。",
  },
  {
    id: "source_code",
    label: "源码与实现",
    prompt:
      "来源优先真实源码、测试、提交记录及维护者讨论，将实现事实与文档描述相互核对。",
  },
  {
    id: "academic",
    label: "论文与原始研究",
    prompt:
      "来源优先原始论文、数据集和可复现实验，比较方法与实验条件，明确同行评审及全文获取情况。",
  },
  {
    id: "industry",
    label: "行业报告与实践",
    prompt:
      "来源优先具有清晰方法与口径的行业报告、企业披露和真实案例，标注利益关系和统计偏差。",
  },
] as const;
export const REUSE_OPTIONS = [
  {
    id: "auto",
    label: "自动复用与补缺",
    prompt:
      "资料复用采用自动复用与补缺。先检查已有报告和材料，复用可核验内容，针对缺口或过期资料补查。没有已有材料时正常开展研究。",
  },
  {
    id: "existing_only",
    label: "仅使用已有资料",
    prompt:
      "资料复用采用仅使用已有资料。只分析任务提供的本地报告与材料，不联网补查；资料不足时明确缺口，避免补写无依据结论。",
  },
  {
    id: "refresh",
    label: "重新核验与更新",
    prompt:
      "资料复用采用重新核验与更新。已有报告只作为线索，重新核对关键来源和时效，记录结论变化与更新依据。",
  },
] as const;
export const CONFIG_OPTIONS = {
  reportType: REPORT_OPTIONS,
  depth: DEPTH_OPTIONS,
  lengthPreset: LENGTH_OPTIONS,
  focusAreas: FOCUS_OPTIONS,
  readerRole: READER_OPTIONS,
  familiarity: FAMILIARITY_OPTIONS,
  sourcePreference: SOURCE_OPTIONS,
  reuseStrategy: REUSE_OPTIONS,
};
export const CONFIG_DEFAULTS = {
  taskTemplateId: "",
  taskTemplateName: "",
  taskInstructions: "",
  reportType: "development",
  depth: "standard",
  lengthPreset: "detailed",
  focusAreas: ["mechanism", "comparison"],
  readerRole: "engineer",
  familiarity: "beginner",
  sourcePreference: "mixed",
  reuseStrategy: "auto",
} as const;

export function normalizeResearchConfig(
  input: Partial<ResearchConfig>,
  defaults?: ResearchConfig,
): ResearchConfig {
  const value = { ...CONFIG_DEFAULTS, ...defaults, ...input } as ResearchConfig;
  if (!input.reportType && input.styles) {
    const styles = input.styles;
    const legacyTemplates = [
      ["literature", "literature"],
      ["tutorial", "tutorial"],
      ["technical", "development"],
      ["comparison", "selection"],
    ] as const;
    value.reportType =
      legacyTemplates.find(([style]) => styles.includes(style))?.[1] ??
      "tutorial";
    if (!input.focusAreas)
      value.focusAreas = [
        ...(styles.includes("technical") ? ["mechanism" as const] : []),
        ...(styles.includes("comparison") ? ["comparison" as const] : []),
      ];
  }
  if (!input.lengthPreset && input.length)
    value.lengthPreset =
      LENGTH_OPTIONS.find((option) => option.value === input.length)?.id ??
      "legacy";
  const length = LENGTH_OPTIONS.find(
    (option) => option.id === value.lengthPreset,
  );
  if (length) value.length = length.value;
  if (Array.isArray(value.focusAreas)) value.focusAreas = [...value.focusAreas];
  return value;
}
