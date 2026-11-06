import type { ResearchConfig } from "./types.js";
import { normalizeResearchConfig } from "./config.js";

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  config: Partial<ResearchConfig>;
  instructions: string;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "learning",
    name: "入门学习",
    description: "从零建立概念地图，用完整案例理解一个新主题。",
    config: {
      reportType: "tutorial",
      depth: "standard",
      lengthPreset: "detailed",
      familiarity: "beginner",
      focusAreas: ["mechanism", "implementation"],
    },
    instructions: [
      "任务目标是帮助读者从已有知识出发掌握一个新主题，并能独立完成基础验证。",
      "先交代主题解决的问题、前置知识和概念地图，首次出现的术语都要解释。",
      "用一个贯穿全文的最小案例演示输入、处理过程和输出，再扩展到实际应用。",
      "按知识依赖逐层展开，解释常见误区、错误理解及纠正方法。",
      "交付应包含学习路径、完整案例、关键概念、练习与检查答案的方法。对于尚未核验的示例明确说明。",
    ].join("\n"),
  },
  {
    id: "derivation",
    name: "推导式理解",
    description: "从朴素方案的不足出发，逐步推导机制与设计。",
    config: {
      reportType: "derivation",
      depth: "deep",
      lengthPreset: "long",
      familiarity: "beginner",
      focusAreas: ["mechanism", "evidence", "risk"],
    },
    instructions: [
      "任务目标是让读者理解设计为何产生，能够从问题和约束自行推导关键机制。",
      "选择一个具体问题，给出最简单的可行尝试，再用反例或约束揭示其不足。",
      "每次改进都写清新增假设、解决的问题、引入的代价和仍未解决的边界。",
      "算法、公式或协议细节需要逐步说明变量、状态和因果，关键推理配合可检查的例子。",
      "最终回到完整机制，串联各阶段演进，列出何时需要该设计以及何时简单方案就足够。",
    ].join("\n"),
  },
  {
    id: "selection",
    name: "技术选型",
    description: "围绕实际约束比较方案，形成有依据的选择建议。",
    config: {
      reportType: "selection",
      depth: "standard",
      lengthPreset: "detailed",
      familiarity: "familiar",
      focusAreas: ["comparison", "cost", "risk", "evidence"],
    },
    instructions: [
      "任务目标是为给定场景做出可解释的技术选择，先整理硬约束、偏好、现有系统和未知条件。",
      "筛选有现实可行性的候选，在一致工作负载、版本和评价口径下比较能力、复杂度、成本和风险。",
      "硬约束与可权衡指标分开处理，缺少依据时保留未知，避免凭空打分或编造基准数据。",
      "给出首选、备选、淘汰理由和选择反转的条件，说明迁移成本、锁定效应及运维要求。",
      "交付决策矩阵、带条件的建议、最小验证方案和上线前的验收标准。",
    ].join("\n"),
  },
  {
    id: "industry",
    name: "行业调研",
    description: "梳理价值链、参与者、商业模式和有证据的趋势。",
    config: {
      reportType: "industry",
      depth: "standard",
      lengthPreset: "long",
      readerRole: "decision_maker",
      familiarity: "beginner",
      focusAreas: ["comparison", "evidence", "cost", "evolution"],
      sourcePreference: "industry",
    },
    instructions: [
      "任务目标是建立行业全景并识别值得进一步验证的机会，首先界定地域、时间、产品与市场边界。",
      "分析价值链、供需关系、主要参与者、商业模式和关键技术路线，说明各方的资源与约束。",
      "市场规模、增速和份额必须注明来源、统计时间和口径，区分实际数据、机构预测与自身估算。",
      "用真实案例解释竞争壁垒、成本结构和政策影响，记录样本与利益相关偏差。",
      "交付行业地图、关键变化、机会与风险、证据缺口和后续跟踪指标，避免无条件的市场判断。",
    ].join("\n"),
  },
  {
    id: "development",
    name: "功能开发研究",
    description: "把功能目标拆成架构、接口、实现路径和验证计划。",
    config: {
      reportType: "development",
      depth: "deep",
      lengthPreset: "detailed",
      readerRole: "engineer",
      familiarity: "familiar",
      focusAreas: ["mechanism", "implementation", "risk"],
      sourcePreference: "official",
    },
    instructions: [
      "任务目标是为功能实现提供可执行的开发依据，明确使用场景、输入输出、兼容范围和验收条件。",
      "结合已有项目结构与依赖，追踪正常入口、调用链、数据存储和外部接口，优先复用现有实现。",
      "比较关键实现路线，解释协议、数据结构、并发、重试、部分失败和历史数据兼容问题。",
      "给出按依赖排序的实施步骤、需要修改的模块、接口约定和针对具体风险的验证方法。",
      "本任务交付开发研究报告。代码示例与已运行验证分别标明，缺少环境或源码时明确受影响结论。",
    ].join("\n"),
  },
  {
    id: "source",
    name: "源码剖析",
    description: "沿真实调用链解释实现，并核对设计取舍与边界。",
    config: {
      reportType: "source_analysis",
      depth: "deep",
      lengthPreset: "long",
      readerRole: "engineer",
      familiarity: "familiar",
      focusAreas: ["mechanism", "evidence", "performance"],
      sourcePreference: "source_code",
    },
    instructions: [
      "任务目标是通过实际源码解释目标功能如何运行，首先固定仓库、版本或提交，以及需要回答的问题。",
      "从真实用户入口追踪调用链、核心数据结构、状态转换和关键依赖，区分框架代码与业务代码。",
      "关键结论引用文件与行号，解释正常路径、异常分支、资源生命周期和并发行为。",
      "用小规模输入走读执行过程，说明实现动机、性能代价和替代设计，验证失败时保留具体缺口。",
      "交付源码导航、机制解析、贯穿案例、边界条件及验证记录，未读取或未运行的部分要明确标注。",
    ].join("\n"),
  },
  {
    id: "literature",
    name: "文献调研",
    description: "比较原始研究的方法、实验条件、结论与局限。",
    config: {
      reportType: "literature",
      depth: "deep",
      lengthPreset: "long",
      readerRole: "researcher",
      familiarity: "familiar",
      focusAreas: ["evidence", "comparison", "mechanism"],
      sourcePreference: "academic",
    },
    instructions: [
      "任务目标是围绕明确研究问题梳理证据与方法谱系，记录检索范围、关键词、时间和筛选标准。",
      "优先阅读原始论文，标明哪些读取了全文、哪些只有摘要，区分同行评审、预印本和作者声明。",
      "按问题或方法组织文献，比较假设、数据集、基线、实验条件、效果、局限和可复现性。",
      "对不具可比性的数字说明差异，分析相互冲突的结论及潜在混杂因素，避免按摘要堆砌论文。",
      "交付研究脉络、文献比较表、证据评估、研究空白和可验证的后续问题，并提供原始来源。",
    ].join("\n"),
  },
  {
    id: "implementation",
    name: "实施落地",
    description: "形成可以逐步执行、验收和回滚的操作指南。",
    config: {
      reportType: "implementation",
      depth: "standard",
      lengthPreset: "detailed",
      readerRole: "engineer",
      familiarity: "familiar",
      focusAreas: ["implementation", "risk", "cost"],
      sourcePreference: "official",
    },
    instructions: [
      "任务目标是把已明确的方案转成可执行的实施指南，先列环境、权限、依赖、版本和输入材料。",
      "按准备、部署或配置、集成、验证、上线、运维分阶段展开，每步写明输入、操作与预期结果。",
      "命令和配置示例说明适用平台与路径约定，涉及变更时交代影响范围、数据保留和恢复路径。",
      "每个关键里程碑给出检查方法，列出常见失败症状、定位方法和处置步骤。",
      "交付实施步骤、验收清单、故障排查及回滚方案，未经实际运行的步骤明确标为待验证。",
    ].join("\n"),
  },
  {
    id: "debug",
    name: "Bug 根因分析",
    description: "用复现、证据和假设检验定位根因，给出修复路径。",
    config: {
      reportType: "debug_audit",
      depth: "deep",
      lengthPreset: "detailed",
      readerRole: "engineer",
      familiarity: "familiar",
      focusAreas: ["mechanism", "evidence", "risk"],
      sourcePreference: "source_code",
    },
    instructions: [
      "任务目标是定位可复现故障的根因，先记录预期行为、实际行为、复现步骤、环境和影响范围。",
      "沿输入、边界、状态及依赖逐层追踪，收集日志、错误、源码和最近变化，区分现象与原因。",
      "每次提出一个可证伪假设，以最小检查验证，记录支持证据、反证和未排除的解释。",
      "比较修复方法对已有调用者、历史数据、并发和失败重试的影响，优先选择覆盖根因的最小改动。",
      "交付根因链、证据、修复建议和回归验证方案；没有足够证据时明确保留待验证假设。",
    ].join("\n"),
  },
  {
    id: "performance",
    name: "性能优化研究",
    description: "建立基线、定位瓶颈，再比较优化收益与代价。",
    config: {
      reportType: "debug_audit",
      depth: "deep",
      lengthPreset: "detailed",
      readerRole: "engineer",
      familiarity: "advanced",
      focusAreas: ["performance", "evidence", "cost", "comparison"],
      sourcePreference: "source_code",
    },
    instructions: [
      "任务目标是在明确工作负载下解释性能瓶颈并形成优化计划，先定义延迟、吞吐、资源和稳定性指标。",
      "记录硬件、软件版本、数据规模、并发度、预热及统计口径，建立可重复的测量基线。",
      "通过剖析、追踪、计数或源码分析区分热点与真正瓶颈，说明采样误差及影响结论的条件。",
      "逐项比较优化假设、预期收益、资源代价、正确性与回归风险，防止把其他环境的数字直接外推。",
      "交付瓶颈证据、分优先级方案、实验设计和验收条件。无法实测时只给出待验证方案并注明限制。",
    ].join("\n"),
  },
  {
    id: "verification",
    name: "证据核验",
    description: "逐条核对关键观点，识别过时、冲突和缺失证据。",
    config: {
      reportType: "tracking",
      depth: "standard",
      lengthPreset: "detailed",
      familiarity: "familiar",
      focusAreas: ["evidence", "risk", "evolution"],
      reuseStrategy: "refresh",
    },
    instructions: [
      "任务目标是核验给定报告或观点的准确性、证据质量及当前适用性，先拆分可核验的事实主张。",
      "逐条寻找原始来源，检查来源日期、版本、适用范围及与原文结论之间的推理关系。",
      "区分支持、部分支持、证据不足、相互冲突和已经过时的结论，避免把无法核验直接等同于错误。",
      "对重要修正解释差异来自事实变化、来源误读还是假设不成立，提供可定位的原文依据。",
      "交付观点核验表、必要修正、仍待确认项和更新后的判断，保留原始主张与证据的对应关系。",
    ].join("\n"),
  },
  {
    id: "tracking",
    name: "专题追踪",
    description: "沿时间线解释重要变化，形成持续观察指标。",
    config: {
      reportType: "tracking",
      depth: "standard",
      lengthPreset: "detailed",
      familiarity: "familiar",
      focusAreas: ["evolution", "evidence", "comparison"],
      reuseStrategy: "refresh",
    },
    instructions: [
      "任务目标是追踪一个专题在明确时间范围内的发展，先给出研究截止时间和作为对照的历史基线。",
      "沿时间线整理重要发布、版本、政策、实验或市场变化，区分事件发生日期与报道日期。",
      "解释每项变化与既有结论的关系，核查一手来源，过滤重复报道和缺少事实基础的预测。",
      "分析各路线的演进动机、持续约束及争议，说明新增证据使哪些判断加强或减弱。",
      "交付变化清单、影响分析、仍有争议的问题和后续跟踪指标，预测部分明确列出假设。",
    ].join("\n"),
  },
];

export function applyTaskTemplate(
  config: ResearchConfig,
  templateId: string,
): ResearchConfig {
  const template = TASK_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error("任务模板不存在");
  return normalizeResearchConfig({
    ...config,
    ...structuredClone(template.config),
    taskTemplateId: `builtin:${template.id}`,
    taskTemplateName: template.name,
    taskInstructions: template.instructions,
  });
}
export function restoreTaskTemplateSelection(
  config: Partial<ResearchConfig>,
): Partial<ResearchConfig> {
  if (config.taskTemplateId !== undefined || !config.taskInstructions)
    return config;
  const template = TASK_TEMPLATES.find(
    (item) => item.instructions === config.taskInstructions,
  );
  return template
    ? {
        ...config,
        taskTemplateId: `builtin:${template.id}`,
        taskTemplateName: template.name,
      }
    : config;
}
