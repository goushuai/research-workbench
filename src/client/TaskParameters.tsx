import type { ResearchConfig, Run } from "../shared/types.js";
import { CONFIG_OPTIONS, normalizeResearchConfig } from "../shared/config.js";

const parameterLabels: Record<keyof typeof CONFIG_OPTIONS, string> = {
  reportType: "报告主模板",
  depth: "研究深度",
  lengthPreset: "篇幅",
  focusAreas: "侧重点",
  readerRole: "读者背景",
  familiarity: "主题熟悉度",
  sourcePreference: "来源偏好",
  reuseStrategy: "资料复用策略",
};

export function TaskParameters({
  config: rawConfig,
  run,
}: {
  config: ResearchConfig;
  run?: Run;
}) {
  const config = normalizeResearchConfig(rawConfig);
  const contentKind = run?.contentKind ?? run?.kind;
  const rows = [
    [
      "本轮类型",
      run
        ? {
            research: "初次研究",
            resume: "继续研究",
            rewrite: "重写报告",
            glossary: "提取术语",
            verify: "核验与更新",
          }[run.kind]
        : "研究",
    ],
    ["研究模型", config.model],
    [
      "推理强度",
      config.reasoningEffort === "default"
        ? "模型默认"
        : config.reasoningEffort,
    ],
    ["任务模板", config.taskTemplateName || "自定义配置"],
    ...Object.entries(CONFIG_OPTIONS).map(([field, options]) => {
      const value = config[field as keyof typeof CONFIG_OPTIONS];
      const selected = Array.isArray(value) ? value : [value];
      const label =
        field === "reportType" && contentKind === "glossary"
          ? "术语说明"
          : field === "reportType" && contentKind === "verify"
            ? "观点核验报告"
            : field === "lengthPreset"
              ? config.length
              : options
                  .filter((option) => selected.includes(option.id as never))
                  .map((option) => option.label)
                  .join("、");
      return [
        parameterLabels[field as keyof typeof CONFIG_OPTIONS],
        label || "未设置",
      ];
    }),
    ["补充背景", config.audience || "未填写"],
    ["执行预算", `${config.budgetMinutes} 分钟`],
    ["执行权限", config.permission === "full" ? "完全授权" : "限定授权"],
    ["报告格式", config.format],
    ["工作目录", config.workingDirectory || run?.directory || "自动分配"],
    ["执行目录", run?.directory || "尚未创建"],
    [
      "输出目录",
      config.outputDirectory ||
        (run
          ? `${run.directory.replaceAll("\\", "/")}/deliverables`
          : "自动分配"),
    ],
  ];
  return (
    <section className="run-parameters" aria-label="启动参数">
      <div className="section-heading">
        <h2>启动参数</h2>
        <p>本轮启动时保存的配置快照</p>
      </div>
      <dl className="parameter-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <details className="parameter-prompt">
        <summary>任务提示词与约束</summary>
        <pre>{config.taskInstructions || "本轮未设置额外任务提示词。"}</pre>
      </details>
      {run && (
        <details className="parameter-prompt">
          <summary>本轮完整研究提示词</summary>
          <pre>{run.prompt}</pre>
        </details>
      )}
    </section>
  );
}
