import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  FlaskConical,
  Folder,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Tags,
  Trash2,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { ThemeSettings } from "./ThemeSettings.js";
import {
  FOLLOWUP_OPTIONS,
  feedbackForIntent,
  makeFollowup,
  effectiveFollowup,
  candidateExecutionConfig,
} from "../shared/followup.js";
import { readAppearance, saveAppearance, applyAppearance } from "./theme.js";
import { reportHtml } from "./report.js";
import DOMPurify from "dompurify";
import {
  type AccountStatus,
  type Artifact,
  type CandidateJob,
  type FollowupInput,
  type LogEntry,
  type ModelInfo,
  type ResearchConfig,
  type Task,
  type Template,
  type Topic,
  type WorkbenchState,
} from "../shared/types.js";
import {
  CONFIG_OPTIONS,
  REPORT_OPTIONS,
  FOCUS_OPTIONS,
  DEPTH_OPTIONS,
  normalizeResearchConfig,
} from "../shared/config.js";
import { switchModel } from "./models.js";
import { parsePageHash, pageHash, artifactPageHash } from "./navigation.js";
import { artifactFormat, readableArtifacts, primaryArtifacts } from "../shared/artifacts.js";
import { reportSections } from "../shared/report-sections.js";
import { TaskParameters } from "./TaskParameters.js";
import { TASK_TEMPLATES, applyTaskTemplate } from "../shared/task-templates.js";
const PdfReader = lazy(() => import("./PdfReader.js"));

const sections = [
  ["topics", "课题管理", BookOpen],
  ["tasks", "研究任务", FlaskConical],
  ["artifacts", "产出物", FileText],
  ["templates", "任务模板", LayoutGrid],
  ["tags", "标签管理", Tags],
  ["settings", "执行设置", Settings2],
] as const;
type Section = (typeof sections)[number][0];
const statusLabels: Record<string, string> = {
  queued: "排队中",
  starting: "启动中",
  running: "研究中",
  waiting_input: "等待输入",
  finalizing: "收尾中",
  completed: "已完成",
  failed: "执行失败",
  stopped: "已停止",
  interrupted: "已中断",
};
const effortLabels: Record<string, string> = {
  default: "模型默认",
  none: "无（none）",
  minimal: "极低（minimal）",
  low: "低（low）",
  medium: "中（medium）",
  high: "高（high）",
  xhigh: "超高（xhigh）",
  max: "最高（max）",
};
const active = new Set([
  "queued",
  "starting",
  "running",
  "waiting_input",
  "finalizing",
]);
const date = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "X-Workbench-Request": "1", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data as T;
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const heading = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    root?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(event: KeyboardEvent) {
      if ([...document.querySelectorAll(".modal")].at(-1) !== root) return;
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !root) return;
      const controls = [
        ...root.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === root)
      ) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
      >
        <header>
          <div>
            <span className="eyebrow">DEEP RESEARCH</span>
            <h2 id={heading}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="关闭窗口" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ConfigEditor({
  value: rawValue,
  change,
  models,
  templates = [],
  hiddenTemplateIds = [],
  profile = "full",
}: {
  value: ResearchConfig;
  change: (value: ResearchConfig) => void;
  models: ModelInfo[];
  templates?: Template[];
  hiddenTemplateIds?: string[];
  profile?: "full" | "report" | "glossary" | "verify" | "execution";
}) {
  const value = normalizeResearchConfig(rawValue);
  const presets = TASK_TEMPLATES.filter((template) => !hiddenTemplateIds.includes(template.id));
  const model = models.find((item) => item.id === value.model);
  const efforts = model?.reasoningEfforts ?? ["default"];
  const update = <K extends keyof ResearchConfig>(
    key: K,
    next: ResearchConfig[K],
  ) => change({ ...value, [key]: next });
  const selectField = (
    field: Exclude<keyof typeof CONFIG_OPTIONS, "focusAreas">,
    label: string,
  ) => (
    <label>
      {label}
      <select
        value={value[field]}
        onChange={(event) =>
          change(
            normalizeResearchConfig({ ...value, [field]: event.target.value }),
          )
        }
      >
        {field === "lengthPreset" && value.lengthPreset === "legacy" && (
          <option value="legacy">历史篇幅 · {value.length}</option>
        )}
        {CONFIG_OPTIONS[field].map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="config-editor">
      {profile === "full" && (
        <>
          <label>
            从任务模板开始
            <select
              value={value.taskTemplateId}
              onChange={(event) => {
                if (event.target.value.startsWith("builtin:")) {
                  change(applyTaskTemplate(value, event.target.value.slice(8)));
                  return;
                }
                if (!event.target.value) {
                  change({
                    ...value,
                    taskTemplateId: "",
                    taskTemplateName: "",
                  });
                  return;
                }
                const template = templates.find(
                  (item) => item.id === event.target.value,
                );
                if (template)
                  change({
                    ...template.config,
                    taskTemplateId: template.id,
                    taskTemplateName: template.name,
                  });
              }}
            >
              <option value="">选择模板以填入任务提示词和配置</option>
              {value.taskTemplateId &&
                !presets.some(
                  (template) =>
                    `builtin:${template.id}` === value.taskTemplateId,
                ) &&
                !templates.some(
                  (template) => template.id === value.taskTemplateId,
                ) && (
                  <option value={value.taskTemplateId}>
                    已选 · {value.taskTemplateName || "自定义任务模板"}
                  </option>
                )}
              <optgroup label="内置任务模板">
                {presets.map((item) => (
                  <option key={item.id} value={`builtin:${item.id}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
              {templates.length > 0 && (
                <optgroup label="我的任务模板">
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label>
            任务提示词与约束
            <textarea
              rows={7}
              maxLength={20000}
              value={value.taskInstructions}
              onChange={(event) =>
                update("taskInstructions", event.target.value)
              }
              placeholder="选择任务模板后可在这里调整研究目标、分析步骤、交付要求和证据约束。"
            />
            <span className="field-hint">
              与本次研究主题、报告模板及深度配置一同发送，保存在课题、模板和每轮运行中。
            </span>
          </label>
        </>
      )}
      <div className="form-grid">
        <label>
          {profile === "execution" ? "本次生成模型" : "研究模型"}
          <select
            value={value.model}
            onChange={(event) =>
              change(switchModel(value, event.target.value, models))
            }
          >
            {!model && (
              <option value={value.model}>
                {value.model || "模型目录尚未加载"}
              </option>
            )}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          推理强度
          <select
            value={value.reasoningEffort}
            onChange={(event) =>
              update(
                "reasoningEffort",
                event.target.value as ResearchConfig["reasoningEffort"],
              )
            }
          >
            {!efforts.includes(value.reasoningEffort) && (
              <option value={value.reasoningEffort}>
                {effortLabels[value.reasoningEffort]}（待核验）
              </option>
            )}
            {[...new Set(["default", ...efforts])].map((item) => (
              <option key={item} value={item}>
                {effortLabels[item] || item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-hint">
        <CircleHelp size={13} />
        {model?.capabilitySource === "catalog"
          ? "推理等级来自模型能力目录。切换模型时自动保留兼容配置。"
          : model?.capabilitySource === "documentation"
            ? "推理等级按 OpenAI 官方模型定义展示，当前订阅通道的实际支持情况以调用结果为准。"
            : "模型目录未提供完整能力信息，推理等级以实际调用结果为准。"}
      </p>
      {profile !== "execution" && (
        <section className="config-group">
          <h4>
            读者 <small>决定从哪里讲起</small>
          </h4>
          <div className="form-grid">
            {selectField("readerRole", "读者背景")}
            {selectField("familiarity", "对主题的熟悉度")}
          </div>
          <label>
            补充背景（可选）
            <input
              value={value.audience}
              onChange={(event) => update("audience", event.target.value)}
              placeholder="如，熟悉 Java，首次接触分布式系统"
            />
          </label>
        </section>
      )}
      {profile !== "glossary" && profile !== "execution" && (
        <section className="config-group">
          <h4>
            报告 <small>决定怎样讲、讲多深</small>
          </h4>
          <div className="form-grid">
            {profile !== "verify" && selectField("reportType", "主模板")}
            {selectField("depth", "研究深度")}
            {selectField("lengthPreset", "篇幅")}
          </div>
          {profile !== "verify" && (
            <p className="field-hint">
              {
                REPORT_OPTIONS.find((option) => option.id === value.reportType)
                  ?.prompt
              }
            </p>
          )}
          <p className="field-hint">
            {DEPTH_OPTIONS.find((option) => option.id === value.depth)?.prompt}
          </p>
          <label>
            侧重点（可多选）
            <span className="style-options">
              {FOCUS_OPTIONS.map((style) => (
                <button
                  type="button"
                  key={style.id}
                  className={
                    value.focusAreas.includes(style.id)
                      ? "style-option selected"
                      : "style-option"
                  }
                  title={style.prompt}
                  aria-label={`侧重点 ${style.label}`}
                  aria-pressed={value.focusAreas.includes(style.id)}
                  onClick={() =>
                    update(
                      "focusAreas",
                      value.focusAreas.includes(style.id)
                        ? value.focusAreas.filter((item) => item !== style.id)
                        : [...value.focusAreas, style.id],
                    )
                  }
                >
                  {value.focusAreas.includes(style.id) && <Check size={12} />}{" "}
                  {style.label}
                </button>
              ))}
            </span>
          </label>
        </section>
      )}
      {profile !== "execution" && (
        <section className="config-group">
          <h4>
            资料 <small>决定来源与复用方式</small>
          </h4>
          <div className="form-grid">
            {selectField("sourcePreference", "来源偏好")}
            {selectField("reuseStrategy", "资料复用策略")}
          </div>
        </section>
      )}
      <details>
        <summary>
          执行选项 <ChevronDown size={14} />
        </summary>
        <div className="detail-fields">
          <p className="field-hint">
            {profile === "execution"
              ? "此预算只控制本次候选生成。"
              : "工作空间、执行记录和报告自动保存在部署目录的 state/workbench 子目录中。续写复用原会话的工作空间。"}
          </p>
          <div className="form-grid">
            <label>
              执行预算（分钟）
              <input
                type="number"
                min={1}
                max={1440}
                value={value.budgetMinutes}
                onChange={(event) =>
                  update("budgetMinutes", Number(event.target.value))
                }
              />
            </label>
            {profile !== "execution" && (
              <label>
                执行权限
                <select
                  value={value.permission}
                  onChange={(event) =>
                    update(
                      "permission",
                      event.target.value as ResearchConfig["permission"],
                    )
                  }
                >
                  <option value="limited">限定授权</option>
                  <option value="full">完全授权</option>
                </select>
              </label>
            )}
          </div>
          {profile !== "execution" && (
            <p className="field-hint">
              报告格式为
              Markdown。完全授权允许研究执行器在工作目录中执行工具操作。
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

export default function App() {
  const [appearance, setAppearance] = useState(readAppearance);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    applyAppearance(appearance, systemDark);
    saveAppearance(appearance);
  }, [appearance, systemDark]);
  const darkTheme =
    appearance.mode === "dark" || (appearance.mode === "system" && systemDark);
  const [state, setState] = useState<WorkbenchState | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelWarning, setModelWarning] = useState("");
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [section, setSection] = useState<Section>(
    () => parsePageHash(window.location.hash).section,
  );
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const topicStarts = useRef(
    new Map<string, { requestId: string; pending: boolean }>(),
  );
  const [editor, setEditor] = useState<{
    kind: "topic" | "task" | "template";
    id?: string;
    requestId: string;
    title: string;
    description: string;
    tags: string[];
    priority: Topic["priority"];
    config: ResearchConfig;
  } | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(
    () => parsePageHash(window.location.hash).taskId,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(
    () => parsePageHash(window.location.hash).artifactId ?? null,
  );
  const [convertingArtifact, setConvertingArtifact] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");
  const [input, setInput] = useState("");
  const [resumeConfig, setResumeConfig] = useState<ResearchConfig | null>(null);
  const [settings, setSettings] = useState<ResearchConfig | null>(null);
  const [tagEditor, setTagEditor] = useState<{
    id?: string;
    name: string;
    color: string;
  } | null>(null);
  const [folderEditor, setFolderEditor] = useState<{
    id?: string;
    name: string;
    parentId: string | null;
  } | null>(null);
  const [folderFilter, setFolderFilter] = useState("");
  const [artifactEditor, setArtifactEditor] = useState<Artifact | null>(null);
  const [followup, setFollowup] = useState<FollowupInput | null>(null);
  useEffect(() => {
    if (!followup || !selectedArtifact) return;
    try {
      localStorage.setItem(
        `research-followup-${selectedArtifact}`,
        JSON.stringify(followup),
      );
      localStorage.setItem(
        `research-followup-${selectedArtifact}-${followup.intent}`,
        JSON.stringify(followup),
      );
    } catch {
      /* A full or disabled browser store must not prevent research. */
    }
  }, [followup, selectedArtifact]);
  const [job, setJob] = useState<CandidateJob | null>(null);
  const candidateRestoreKey = useRef("");
  const [candidateSelection, setCandidateSelection] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    action: () => Promise<void>;
  } | null>(null);
  const refreshSequence = useRef(0);
  const task = state?.tasks.find((item) => item.id === selectedTask);
  const resumeContentKind = task?.latestRun?.contentKind ??
    [...(task?.runs ?? [])].reverse().find((run) => run.kind !== "resume")?.kind;
  const viewedRun =
    task?.runs.find((run) => run.id === selectedRunId) ?? task?.latestRun;
  useEffect(() => {
    const onNavigate = () => {
      const location = parsePageHash(window.location.hash);
      setSection(location.section);
      setSelectedTask(location.taskId);
      setSelectedArtifact(location.artifactId ?? null);
      setInput("");
    };
    window.addEventListener("hashchange", onNavigate);
    return () => window.removeEventListener("hashchange", onNavigate);
  }, []);
  useEffect(() => {
    if (!window.location.hash && section === "topics" && !selectedTask) return;
    const hash = section === "artifacts" && selectedArtifact
      ? artifactPageHash(selectedArtifact)
      : pageHash(section, section === "tasks" ? selectedTask : null);
    if (window.location.hash !== hash) window.location.hash = hash;
  }, [section, selectedTask, selectedArtifact]);
  useEffect(() => setSelectedRunId(null), [selectedTask]);
  useEffect(() => {
    if (task) setResumeConfig(task.latestRun?.config ?? task.config);
  }, [task?.id]);
  const artifact = state?.artifacts.find(
    (item) => item.id === selectedArtifact,
  );
  const artifactEntries = primaryArtifacts(state?.artifacts ?? []);
  function artifactHref(item: Artifact) {
    if (["md", "pdf"].includes(artifactFormat(item))) return artifactPageHash(item.id);
    return `/api/artifacts/${item.id}/download`;
  }
  function formatLinks(item: Artifact) {
    return <div className="artifact-formats" aria-label="可读格式">
      {readableArtifacts(item, state?.artifacts ?? []).map((file) => (
        <a key={file.id} className="format-link" href={artifactHref(file)} target="_blank" rel="noopener noreferrer">
          {artifactFormat(file).toUpperCase()}
        </a>
      ))}
    </div>;
  }
  async function convertPdf(item: Artifact) {
    setConvertingArtifact(item.id);
    try {
      await perform(async () => {
        await api<Artifact>(`/artifacts/${item.id}/pdf`, "POST", {});
      }, "PDF 已生成，可点击 PDF 打开");
    } finally {
      setConvertingArtifact(null);
    }
  }
  function readFollowupDraft(intent?: FollowupInput["intent"]): FollowupInput {
    const sourceConfig =
      state?.tasks
        .find((item) => item.id === artifact?.taskId)
        ?.runs.find((run) => run.id === artifact?.runId)?.config ??
      state!.settings;
    try {
      const key = `research-followup-${artifact!.id}`;
      const last = JSON.parse(localStorage.getItem(key) || "null");
      const target =
        intent ??
        (FOLLOWUP_OPTIONS.some((option) => option.id === last?.intent)
          ? last.intent
          : "rewrite");
      const saved =
        JSON.parse(localStorage.getItem(`${key}-${target}`) || "null") ??
        (last?.intent === target ? last : null);
      if (
        saved &&
        typeof saved.instructions === "string" &&
        Array.isArray(saved.feedback) &&
        saved.config
      ) {
        return effectiveFollowup({
          ...makeFollowup(target, sourceConfig),
          ...saved,
          intent: target,
          feedback: [],
          instructions: [
            saved.instructions,
            saved.feedback.length
              ? `原反馈重点 ${saved.feedback.join("、")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          config: normalizeResearchConfig({ ...sourceConfig, ...saved.config }),
        });
      }
      return makeFollowup(target, sourceConfig);
    } catch {
      return makeFollowup(intent ?? "rewrite", sourceConfig);
    }
  }
  async function refresh() {
    const sequence = ++refreshSequence.current;
    const data = await api<WorkbenchState>("/state");
    if (sequence === refreshSequence.current) {
      setState(data);
      setSettings((previous) => previous ?? data.settings);
    }
  }
  async function loadModels() {
    try {
      const result = await api<{ models: ModelInfo[]; warning?: string }>(
        "/models",
      );
      setModels(result.models);
      setModelWarning(result.warning ?? "");
    } catch (cause) {
      setModelWarning((cause as Error).message);
    }
  }
  async function perform(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      if (success) setNotice(success);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startTopic(topicId: string) {
    const request = topicStarts.current.get(topicId) ?? {
      requestId: crypto.randomUUID(),
      pending: false,
    };
    if (request.pending) return;
    request.pending = true;
    topicStarts.current.set(topicId, request);
    let submitted = false;
    try {
      await perform(async () => {
        const response = await api<{ task: Task }>(
          `/topics/${topicId}/start`,
          "POST",
          { requestId: request.requestId },
        );
        submitted = true;
        setSelectedTask(response.task.id);
        setResumeConfig(
          response.task.latestRun?.config ?? response.task.config,
        );
        setSection("tasks");
      }, "研究已提交");
    } finally {
      request.pending = false;
      if (submitted) topicStarts.current.delete(topicId);
    }
  }
  useEffect(() => {
    void refresh().catch((cause) => setError(cause.message));
    void loadModels();
    void api<AccountStatus>("/account")
      .then(setAccount)
      .catch((cause) => setError(cause.message));
    const events = new EventSource("/api/events", { withCredentials: true });
    events.onmessage = () => {
      void refresh().catch(() => {});
    };
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 8000);
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (account?.loginStatus !== "waiting") return;
    const timer = setInterval(() => {
      void api<AccountStatus>("/account")
        .then((next) => {
          setAccount(next);
          if (next.signedIn) void loadModels();
        })
        .catch((cause) => setError(cause.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [account?.loginStatus]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!viewedRun) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    let after = 0;
    let fetching = false;
    setLogs([]);
    const runId = viewedRun.id;
    const update = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await api<{ entries: LogEntry[] }>(
          `/runs/${runId}/logs?after=${after}`,
        );
        if (cancelled) return;
        if (result.entries.length) {
          after = Math.max(...result.entries.map((entry) => entry.sequence));
          setLogs((previous) => [...previous, ...result.entries].slice(-2000));
        }
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        fetching = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [viewedRun?.id]);
  useEffect(() => {
    if (!selectedArtifact || (artifact && artifactFormat(artifact) !== "md")) return;
    let cancelled = false;
    setContent("");
    setContentError("");
    setContentLoading(true);
    void api<{ content: string }>(`/artifacts/${selectedArtifact}/content`)
      .then((result) => {
        if (!cancelled) setContent(result.content);
      })
      .catch((cause) => {
        if (!cancelled) setContentError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedArtifact, artifact?.relativePath]);
  useEffect(() => {
    if (!job || !active.has(job.status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api<{ job: CandidateJob }>(`/candidate-jobs/${job.id}`)
        .then((result) => {
          if (!cancelled) {
            setJob(result.job);
            if (!active.has(result.job.status))
              setCandidateSelection(
                result.job.candidates
                  .filter((item) => !item.savedTopicId)
                  .map((item) => item.id),
              );
          }
        })
        .catch((cause) => {
          if (!cancelled) setError(cause.message);
        });
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (!followup) {
      candidateRestoreKey.current = "";
      return;
    }
    if (followup.intent !== "derive" || !artifact || job) return;
    const key = `${artifact.id}:derive`;
    if (candidateRestoreKey.current === key) return;
    candidateRestoreKey.current = key;
    const previous = state?.candidateJobs
      ?.filter((item) => item.artifactId === artifact.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (previous) {
      setJob(previous);
      setCandidateSelection(
        previous.candidates
          .filter((item) => !item.savedTopicId)
          .map((item) => item.id),
      );
    }
  }, [followup?.intent, artifact?.id, state?.candidateJobs, job]);
  function openEditor(
    kind: "topic" | "task" | "template",
    item?: Topic | Template,
    presetId?: string,
  ) {
    if (!state) return;
    const preset = TASK_TEMPLATES.find((template) => template.id === presetId);
    setEditor({
      kind,
      requestId: crypto.randomUUID(),
      id: item?.id,
      title:
        item && "title" in item
          ? item.title
          : item && "name" in item
            ? item.name
            : kind === "template" && preset
              ? `${preset.name}（自定义）`
              : "",
      description: item && "description" in item ? item.description : "",
      priority: item && "priority" in item ? item.priority : "normal",
      tags: item && "tags" in item ? item.tags : [],
      config: preset
        ? applyTaskTemplate(state.settings, preset.id)
        : { ...(item?.config ?? state.settings) },
    });
  }
  function remove(path: string, title: string) {
    setConfirmAction({
      title,
      action: async () => {
        await api(path, "DELETE");
        if (path === `/tasks/${selectedTask}`) setSelectedTask(null);
        if (path === `/artifacts/${selectedArtifact}`) setSelectedArtifact(null);
        setConfirmAction(null);
      },
    });
  }
  function matches(item: {
    title?: string;
    name?: string;
    description?: string;
    tags?: string[];
  }) {
    return (
      `${item.title ?? item.name ?? ""} ${item.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!tagFilter || item.tags?.includes(tagFilter))
    );
  }
  const chips = (ids: string[]) => (
    <div className="tag-list">
      {ids.map((id) => {
        const tag = state?.tags.find((item) => item.id === id);
        return tag ? (
          <span
            className="tag"
            key={id}
            style={{ "--tag-color": tag.color } as React.CSSProperties}
          >
            {tag.name}
          </span>
        ) : null;
      })}
    </div>
  );
  const configSummary = (config: ResearchConfig) => (
    <span className="model-summary">
      {config.model} <span>·</span> {effortLabels[config.reasoningEffort]}
      <span>·</span>{" "}
      {REPORT_OPTIONS.find((option) => option.id === config.reportType)?.label}
      <span>·</span>{" "}
      {DEPTH_OPTIONS.find((option) => option.id === config.depth)?.label}
    </span>
  );
  const newButton = (
    <button
      className="primary"
      onClick={() =>
        openEditor(
          section === "templates"
            ? "template"
            : section === "tasks"
              ? "task"
              : "topic",
        )
      }
    >
      <Plus size={16} />
      {section === "templates"
        ? "新建模板"
        : section === "tasks"
          ? "新建研究"
          : "新建课题"}
    </button>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          <strong>
            深研<span>RESEARCH WORKSPACE</span>
          </strong>
        </a>
        <div className="workspace-label">
          <span className="workspace-dot" />
          本地研究工作台<span className="version">01</span>
        </div>
        <div className="nav-caption">工作空间</div>
        <nav>
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={section === id ? "nav-item current" : "nav-item"}
              onClick={() => {
                setSection(id);
                setSelectedTask(null);
                setSelectedArtifact(null);
                setSearch("");
                setTagFilter("");
                setStatusFilter("");
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "topics" && <small>{state?.topics.length ?? "—"}</small>}
              {id === "tasks" &&
                !!state?.tasks.filter(
                  (item) => item.latestRun && active.has(item.latestRun.status),
                ).length && <i className="live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-info">
            <span className="local-orbit">
              <Sparkles size={17} />
            </span>
            <p>
              让好奇心，深入一步<span>课题 · 研究 · 知识积累</span>
            </p>
          </div>
          <div className="local-status">
            <span className="workspace-dot" />
            本地存储<span>个人工作空间</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <span>/</span>{" "}
            <strong>{sections.find((item) => item[0] === section)?.[1]}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              aria-label={darkTheme ? "切换为浅色主题" : "切换为深色主题"}
              title={darkTheme ? "切换为浅色主题" : "切换为深色主题"}
              onClick={() =>
                setAppearance({
                  ...appearance,
                  mode: darkTheme ? "light" : "dark",
                })
              }
            >
              {darkTheme ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className={`connection ${account?.signedIn ? "connected" : ""}`}
              onClick={() => {
                setSelectedTask(null);
                setSection("settings");
              }}
            >
              <span className="workspace-dot" />
              {account?.signedIn ? "ChatGPT 已连接" : "连接 ChatGPT"}
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR RESEARCH, ORGANIZED</div>
              <h1>
                {section === "artifacts" && selectedArtifact
                  ? artifact?.name || artifact?.title || "产出物阅读"
                  : section === "tasks" && selectedTask
                  ? task?.title || "研究详情"
                  : sections.find((item) => item[0] === section)?.[1]}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {section === "artifacts" && selectedArtifact
                  ? "独立阅读页 · 支持 Markdown 渲染与程序转换 PDF。"
                  : section === "tasks" && selectedTask
                  ? "查看每轮启动参数、执行日志与研究进度。"
                  : {
                      topics: "把值得追问的问题，变成下一次深入研究。",
                      tasks: "跟进每一次探索，保留过程与完整研究上下文。",
                      artifacts: "沉淀研究成果，让知识成为下一次探索的起点。",
                      templates:
                        "按任务选择研究方法，用提示词明确分析步骤和交付要求。",
                      tags: "用自己的知识脉络，连接课题、任务与成果。",
                      settings: "管理模型连接与默认执行方式。",
                    }[section]}
              </p>
            </div>
            {section === "artifacts" && selectedArtifact ? (
              <a className="secondary" href={pageHash("artifacts")}>
                <ArrowLeft size={14} />返回产出物
              </a>
            ) : section === "tasks" && selectedTask ? (
              <button
                className="secondary"
                onClick={() => {
                  setSelectedTask(null);
                  setInput("");
                }}
              >
                <ArrowLeft size={14} />
                返回研究任务
              </button>
            ) : ["topics", "tasks", "templates"].includes(section) ? (
              newButton
            ) : section === "tags" ? (
              <button
                className="primary"
                onClick={() => setTagEditor({ name: "", color: "#4d8270" })}
              >
                <Plus size={16} />
                新建标签
              </button>
            ) : section === "artifacts" ? (
              <button
                className="secondary"
                onClick={() => setFolderEditor({ name: "", parentId: null })}
              >
                <Folder size={16} />
                新建目录
              </button>
            ) : null}
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="关闭错误"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {!state ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              <p>正在读取本地工作空间</p>
              <button
                className="text-button"
                onClick={() => void perform(refresh)}
              >
                重新连接
              </button>
            </div>
          ) : (
            <>
              {section === "topics" && (
                <>
                  <div className="overview">
                    <div className="overview-intro">
                      <span className="overline">IDEAS INTO INSIGHTS</span>
                      <h2>下一次发现，从一个问题开始。</h2>
                      <p>收集灵感、明确方向，按自己的节奏开展研究。</p>
                    </div>
                    <div className="metric">
                      <strong>
                        {state.topics.length.toString().padStart(2, "0")}
                      </strong>
                      <span>已收集课题</span>
                    </div>
                    <div className="metric">
                      <strong>
                        {state.tasks
                          .filter(
                            (item) =>
                              item.latestRun &&
                              active.has(item.latestRun.status),
                          )
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                      <span>正在进行</span>
                    </div>
                    <div className="overview-art">
                      <BookOpen size={64} strokeWidth={1} />
                      <Sparkles size={22} />
                    </div>
                  </div>
                  <div className="content-panel">
                    <div className="panel-toolbar">
                      <div className="tab-title">
                        全部课题 <span>{state.topics.length}</span>
                      </div>
                      <div className="filter-group">
                        <div className="search-field">
                          <Search size={16} />
                          <input
                            aria-label="搜索课题"
                            placeholder="搜索课题…"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                          />
                        </div>
                        <select
                          aria-label="按标签筛选"
                          value={tagFilter}
                          onChange={(event) => setTagFilter(event.target.value)}
                        >
                          <option value="">全部标签</option>
                          {state.tags.map((tag) => (
                            <option key={tag.id} value={tag.id}>
                              {tag.name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="按优先级筛选"
                          value={statusFilter}
                          onChange={(event) =>
                            setStatusFilter(event.target.value)
                          }
                        >
                          <option value="">全部优先级</option>
                          <option value="high">高优先级</option>
                          <option value="normal">普通</option>
                          <option value="low">低优先级</option>
                        </select>
                      </div>
                    </div>
                    {state.topics
                      .filter(matches)
                      .filter(
                        (item) =>
                          !statusFilter || item.priority === statusFilter,
                      ).length === 0 ? (
                      <Empty
                        title={
                          state.topics.length
                            ? "没有匹配的课题"
                            : "给好奇心留一个位置"
                        }
                        description="记录一个想深入理解的问题，配置研究方式，随时开始。"
                        action={newButton}
                      />
                    ) : (
                      <div className="table-scroll">
                        <table className="topic-table">
                          <thead>
                            <tr>
                              <th>课题名称</th>
                              <th>标签</th>
                              <th>优先级</th>
                              <th>更新时间</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.topics
                              .filter(matches)
                              .filter(
                                (item) =>
                                  !statusFilter ||
                                  item.priority === statusFilter,
                              )
                              .map((item) => (
                                <tr key={item.id}>
                                  <td>
                                    <button
                                      className="topic-name"
                                      onClick={() => openEditor("topic", item)}
                                    >
                                      <span className="document-icon">
                                        <FileText size={17} />
                                      </span>
                                      <span>
                                        <strong>{item.title}</strong>
                                        <small>
                                          {item.description ||
                                            "尚未添加课题说明"}
                                        </small>
                                      </span>
                                    </button>
                                  </td>
                                  <td>{chips(item.tags)}</td>
                                  <td>
                                    <span
                                      className={`priority ${item.priority}`}
                                    >
                                      <i />
                                      {
                                        {
                                          high: "高优先级",
                                          normal: "普通",
                                          low: "低优先级",
                                        }[item.priority]
                                      }
                                    </span>
                                  </td>
                                  <td className="date-cell">
                                    {date(item.updatedAt)}
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        className="start-button"
                                        disabled={busy}
                                        onClick={() => void startTopic(item.id)}
                                      >
                                        <Play size={12} />
                                        开始研究
                                      </button>
                                      <button
                                        className="icon-button subtle"
                                        aria-label={`删除课题 ${item.title}`}
                                        onClick={() =>
                                          remove(
                                            `/topics/${item.id}`,
                                            `删除课题“${item.title}”？`,
                                          )
                                        }
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="panel-foot">
                      共{" "}
                      {
                        state.topics
                          .filter(matches)
                          .filter(
                            (item) =>
                              !statusFilter || item.priority === statusFilter,
                          ).length
                      }{" "}
                      个课题
                      <span>
                        <span className="workspace-dot" />
                        更改自动保存在本地
                      </span>
                    </div>
                  </div>
                  <div className="quiet-note">
                    <Sparkles size={15} />
                    <span>好的研究，始于一个清晰的问题。</span>
                    <span className="note-line" />
                  </div>
                </>
              )}
              {section === "tasks" && !selectedTask && (
                <div className="content-panel">
                  <div className="panel-toolbar">
                    <div className="tab-title">
                      全部研究 <span>{state.tasks.length}</span>
                    </div>
                    <div className="filter-group">
                      <div className="search-field">
                        <Search size={16} />
                        <input
                          aria-label="搜索研究任务"
                          placeholder="搜索研究…"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </div>
                      <select
                        aria-label="按运行状态筛选"
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(event.target.value)
                        }
                      >
                        <option value="">全部状态</option>
                        {Object.entries(statusLabels).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="task-list">
                    {state.tasks
                      .filter(matches)
                      .filter(
                        (item) =>
                          !statusFilter ||
                          item.latestRun?.status === statusFilter,
                      )
                      .map((item) => (
                        <div className="task-row" key={item.id}>
                        <button
                          className="task-card"
                          onClick={() => {
                            setSelectedTask(item.id);
                            setResumeConfig(
                              item.latestRun?.config ?? item.config,
                            );
                            setInput("");
                          }}
                        >
                          <div className="task-symbol">
                            <FlaskConical size={23} />
                          </div>
                          <div className="task-main">
                            <h3>{item.title}</h3>
                            <p>
                              {item.description || "打开查看研究过程与配置"}
                            </p>
                            <div className="task-meta">
                              {configSummary(
                                item.latestRun?.config ?? item.config,
                              )}
                              <span>{date(item.createdAt)}</span>
                              {chips(item.tags)}
                            </div>
                          </div>
                          <span className={`status ${item.latestRun?.status}`}>
                            {statusLabels[item.latestRun?.status ?? "queued"]}
                          </span>
                          <ArrowRight size={16} />
                        </button>
                        <button
                          className="icon-button task-delete"
                          aria-label={`删除任务 ${item.title}`}
                          disabled={item.runs.some((run) => active.has(run.status))}
                          title={item.runs.some((run) => active.has(run.status)) ? "请先停止任务再删除" : "删除任务及关联记录"}
                          onClick={() => remove(`/tasks/${item.id}`, `删除任务“${item.title}”及其运行、产出物归档记录？研究文件保留在本地历史目录。`)}
                        >
                          <Trash2 size={15} />
                        </button>
                        </div>
                      ))}
                  </div>
                  {!state.tasks
                    .filter(matches)
                    .filter(
                      (item) =>
                        !statusFilter ||
                        item.latestRun?.status === statusFilter,
                    ).length && (
                    <Empty
                      title="等待一场新的探索"
                      description="从课题开始，或直接创建一次研究任务。"
                      action={newButton}
                    />
                  )}
                </div>
              )}
              {section === "artifacts" && !selectedArtifact && (
                <div className="artifact-layout">
                  <aside className="folder-panel">
                    <h3>成果目录</h3>
                    <button
                      className={
                        !folderFilter ? "folder-link selected" : "folder-link"
                      }
                      onClick={() => setFolderFilter("")}
                    >
                      <FileText size={16} />
                      全部产出物<span>{artifactEntries.length}</span>
                    </button>
                    <button
                      className={
                        folderFilter === "__none"
                          ? "folder-link selected"
                          : "folder-link"
                      }
                      onClick={() => setFolderFilter("__none")}
                    >
                      <Folder size={16} />
                      未归档
                    </button>
                    {state.folders.map((folder) => (
                      <div className="folder-row" key={folder.id}>
                        <button
                          className={
                            folderFilter === folder.id
                              ? "folder-link selected"
                              : "folder-link"
                          }
                          onClick={() => setFolderFilter(folder.id)}
                        >
                          <Folder size={16} />
                          {folder.parentId && <small>↳</small>}
                          {folder.name}
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`编辑目录 ${folder.name}`}
                          onClick={() => setFolderEditor(folder)}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    ))}
                  </aside>
                  <div className="content-panel">
                    <div className="panel-toolbar">
                      <div className="search-field">
                        <Search size={16} />
                        <input
                          aria-label="搜索产出物"
                          placeholder="搜索研究成果…"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </div>
                      <select
                        aria-label="按产出物标签筛选"
                        value={tagFilter}
                        onChange={(event) => setTagFilter(event.target.value)}
                      >
                        <option value="">全部标签</option>
                        {state.tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="table-scroll">
                      <table className="artifact-table" aria-label="产出物列表">
                        <thead>
                          <tr>
                            <th>产出物</th><th>来源任务</th><th>可读格式</th>
                            <th>标签</th><th>创建时间</th><th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {artifactEntries.filter(matches).filter((item) =>
                            !folderFilter || (folderFilter === "__none" ? !item.folderId : item.folderId === folderFilter),
                          ).map((item) => (
                            <tr key={item.id}>
                              <td className="artifact-name-cell">
                                <a href={artifactHref(item)} target="_blank" rel="noopener noreferrer">
                                  <FileText size={16} /><strong>{item.name || item.title}</strong>
                                </a>
                                <small>{item.convertedFromArtifactId ? "程序转换" : item.parentArtifactId ? "衍生版本" : "研究报告"}</small>
                              </td>
                              <td>
                                <a className="text-button" href={pageHash("tasks", item.taskId)}>
                                  {state.tasks.find((task) => task.id === item.taskId)?.title || "来源任务"}
                                </a>
                              </td>
                              <td>{formatLinks(item)}</td>
                              <td>{chips(item.tags)}</td>
                              <td className="artifact-date-cell">{date(item.createdAt)}</td>
                              <td>
                                <div className="artifact-row-actions">
                                  {artifactFormat(item) === "md" && !state.artifacts.some((file) => file.convertedFromArtifactId === item.id && artifactFormat(file) === "pdf") && (
                                    <button className="text-button" disabled={busy} onClick={() => void convertPdf(item)}>
                                      {convertingArtifact === item.id ? "正在转换…" : "转成 PDF"}
                                    </button>
                                  )}
                                  <button className="text-button" onClick={() => setArtifactEditor({ ...item })}>编辑归档</button>
                                  <a href={`/api/artifacts/${item.id}/download`} className="icon-button" aria-label={`下载 ${item.name}`}>
                                    <ArrowDownToLine size={16} />
                                  </a>
                                  <button className="icon-button" aria-label={`删除产出物 ${item.name}`} onClick={() => remove(`/artifacts/${item.id}`, `删除产出物“${item.name}”？`)}>
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!artifactEntries
                      .filter(matches)
                      .filter(
                        (item) =>
                          !folderFilter ||
                          (folderFilter === "__none"
                            ? !item.folderId
                            : item.folderId === folderFilter),
                      ).length && (
                      <Empty
                        title="研究成果将在这里沉淀"
                        description="任务生成的报告会自动收录，可阅读、下载、归档或继续探索。"
                      />
                    )}
                  </div>
                </div>
              )}
              {section === "templates" && (
                <div className="template-library">
                  <div className="section-heading">
                    <h2>内置任务模板</h2>
                    <p>
                      每种任务包含独立提示词和推荐报告配置，模型与推理等级沿用当前默认设置。
                    </p>
                  </div>
                  <div className="template-grid">
                    {TASK_TEMPLATES.filter((item) => !state.hiddenTaskTemplateIds.includes(item.id)).filter(matches).map((item) => (
                      <article className="template-card" key={item.id}>
                        <div className="template-card-top">
                          <span className="document-icon">
                            <BookOpen size={21} />
                          </span>
                          <span className="neutral-tag">内置任务</span>
                          <button
                            className="icon-button"
                            aria-label={`删除内置模板 ${item.name}`}
                            onClick={() => remove(`/task-presets/${item.id}`, `删除内置模板“${item.name}”？`)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <h3>{item.name}</h3>
                        <p>{item.description}</p>
                        {configSummary(
                          applyTaskTemplate(state.settings, item.id),
                        )}
                        <details className="template-instructions">
                          <summary>查看任务提示词</summary>
                          <p>{item.instructions}</p>
                        </details>
                        <div className="template-actions">
                          <button
                            className="primary"
                            onClick={() =>
                              openEditor("topic", undefined, item.id)
                            }
                          >
                            用于新课题
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              openEditor("template", undefined, item.id)
                            }
                          >
                            编辑副本
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="section-heading">
                    <h2>我的任务模板</h2>
                    <p>保存经过调整的任务提示词与配置，供以后复用。</p>
                  </div>
                  <div className="template-grid">
                    {state.templates.filter(matches).map((item) => (
                      <article className="template-card" key={item.id}>
                        <div className="template-card-top">
                          <span className="document-icon">
                            <SlidersHorizontal size={21} />
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`删除模板 ${item.name}`}
                            onClick={() =>
                              remove(
                                `/templates/${item.id}`,
                                `删除模板“${item.name}”？`,
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <h3>{item.name}</h3>
                        <p>
                          {
                            CONFIG_OPTIONS.readerRole.find(
                              (option) => option.id === item.config.readerRole,
                            )?.label
                          }{" "}
                          · {item.config.length || "默认篇幅"}
                        </p>
                        {configSummary(item.config)}
                        {item.config.taskInstructions && (
                          <details className="template-instructions">
                            <summary>查看任务提示词</summary>
                            <p>{item.config.taskInstructions}</p>
                          </details>
                        )}
                        <div className="tag-list">
                          {item.config.focusAreas.map((style) => (
                            <span className="neutral-tag" key={style}>
                              {
                                FOCUS_OPTIONS.find(
                                  (option) => option.id === style,
                                )?.label
                              }
                            </span>
                          ))}
                        </div>
                        <button
                          className="secondary full-width"
                          onClick={() => openEditor("template", item)}
                        >
                          编辑配置
                          <ArrowRight size={14} />
                        </button>
                      </article>
                    ))}
                    {!state.templates.length && (
                      <div className="content-panel full-width">
                        <Empty
                          title="建立自己的研究方法"
                          description="保存模型、报告模板、深度与侧重点，复用自己的研究方法。"
                          action={newButton}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {section === "tags" && (
                <div className="content-panel">
                  <div className="panel-toolbar">
                    <div className="tab-title">
                      全部标签 <span>{state.tags.length}</span>
                    </div>
                    <span className="muted">
                      删除标签会移除关联标记，研究内容保留
                    </span>
                  </div>
                  <div className="tag-manager">
                    {state.tags.map((tag) => (
                      <div className="tag-manager-row" key={tag.id}>
                        <span
                          className="tag-color"
                          style={{ background: tag.color }}
                        />
                        <strong>{tag.name}</strong>
                        <span className="muted">
                          {
                            [
                              ...state.topics,
                              ...state.tasks,
                              ...artifactEntries,
                            ].filter((item) => item.tags.includes(tag.id))
                              .length
                          }{" "}
                          项关联
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setTagEditor(tag)}
                        >
                          编辑
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`删除标签 ${tag.name}`}
                          onClick={() =>
                            remove(`/tags/${tag.id}`, `删除标签“${tag.name}”？`)
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!state.tags.length && (
                    <Empty
                      title="让知识有迹可循"
                      description="添加领域、项目或方法标签，建立自己的分类方式。"
                    />
                  )}
                </div>
              )}
              {section === "settings" && (
                <div className="settings-layout">
                  <ThemeSettings value={appearance} change={setAppearance} />
                  <section className="settings-panel">
                    <div className="section-heading">
                      <span className="document-icon">
                        <Sparkles size={20} />
                      </span>
                      <div>
                        <h2>模型与账号</h2>
                        <p>研究执行器使用本地连接的订阅服务。</p>
                      </div>
                    </div>
                    <div className="account-card">
                      <span className="account-avatar">C</span>
                      <div>
                        <strong>
                          {account?.account ||
                            (account?.signedIn
                              ? "ChatGPT 账号"
                              : "尚未连接账号")}
                        </strong>
                        <p>
                          {account?.signedIn
                            ? `${account.plan ?? "计划信息未知"} · 已登录`
                            : "登录后读取可用模型并开始研究"}
                        </p>
                      </div>
                      {account?.signedIn ? (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            setConfirmAction({
                              title: "退出当前 ChatGPT 账号？",
                              action: async () => {
                                const result = await api<{
                                  account: AccountStatus;
                                }>("/account/logout", "POST");
                                setAccount(result.account);
                                setConfirmAction(null);
                                await loadModels();
                              },
                            })
                          }
                        >
                          <LogOut size={14} />
                          退出
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy || account?.loginStatus === "waiting"}
                          onClick={() =>
                            void perform(async () => {
                              const result = await api<{
                                account: AccountStatus;
                              }>("/account/login", "POST");
                              setAccount(result.account);
                            })
                          }
                        >
                          {account?.loginStatus === "waiting"
                            ? "等待授权…"
                            : "连接 ChatGPT"}
                        </button>
                      )}
                    </div>
                    {account?.loginUrl && account.loginStatus === "waiting" && (
                      <div className="alert">
                        <a
                          href={account.loginUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          打开官方登录页面 <ArrowRight size={13} />
                        </a>
                        <span>完成授权后会自动更新连接状态。</span>
                      </div>
                    )}
                    {account?.error && (
                      <p className="error-text">{account.error}</p>
                    )}
                    <div className="environment-row">
                      <span>Copilot CLI</span>
                      <span
                        className={
                          account?.copilotInstalled ? "good-text" : "muted"
                        }
                      >
                        {account?.copilotInstalled ? "已安装" : "尚未检测到"}
                      </span>
                    </div>
                    <div className="environment-row">
                      <span>本地模型转接服务</span>
                      <span
                        className={account?.proxyReady ? "good-text" : "muted"}
                      >
                        {account?.proxyReady ? "可连接" : "未就绪"}
                      </span>
                    </div>
                    {modelWarning && (
                      <div className="alert warning">
                        {modelWarning}
                        <button
                          className="text-button"
                          onClick={() => void loadModels()}
                        >
                          <RefreshCw size={13} />
                          重试
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="settings-panel">
                    <div className="section-heading">
                      <span className="document-icon">
                        <SlidersHorizontal size={20} />
                      </span>
                      <div>
                        <h2>默认研究配置</h2>
                        <p>新课题与研究任务将继承这些配置。</p>
                      </div>
                    </div>
                    {settings && (
                      <>
                        <ConfigEditor
                          hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                          value={settings}
                          change={setSettings}
                          models={models}
                        />
                        <div className="form-actions">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                await api("/settings", "PUT", settings);
                              }, "默认执行设置已保存")
                            }
                          >
                            <Check size={15} />
                            保存默认设置
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          {section === "tasks" && selectedTask && task && (
            <section
              className="task-detail-page task-detail"
              aria-label="研究详情"
            >
              <div className="detail-overview">
                <span className={`status ${viewedRun?.status}`}>
                  {statusLabels[viewedRun?.status ?? "queued"]}
                </span>
                {configSummary(viewedRun?.config ?? task.config)}
                <span className="muted">共 {task.runs.length} 次运行</span>
              </div>
              <p>{task.description}</p>
              {viewedRun && (
                <label className="run-selector">
                  运行记录
                  <select
                    value={viewedRun.id}
                    onChange={(event) => setSelectedRunId(event.target.value)}
                  >
                    {task.runs.map((run, index) => (
                      <option key={run.id} value={run.id}>
                        第 {index + 1} 轮 · {statusLabels[run.status]} ·{" "}
                        {date(run.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {viewedRun?.error && (
                <div className="alert error">{viewedRun.error}</div>
              )}
              <div className="run-facts">
                <span>
                  会话 <code>{viewedRun?.sessionId || "尚未建立"}</code>
                </span>
                <span>
                  输入 {viewedRun?.inputTokens?.toLocaleString() ?? "未知"}{" "}
                  tokens
                </span>
                <span>
                  输出 {viewedRun?.outputTokens?.toLocaleString() ?? "未知"}{" "}
                  tokens
                </span>
              </div>
              <TaskParameters
                config={viewedRun?.config ?? task.config}
                run={viewedRun}
              />
              <div className="log-heading">
                <h3>执行日志</h3>
                <span>{viewedRun?.directory}</span>
              </div>
              <div className="terminal" role="log" aria-live="off">
                {logs.length ? (
                  logs.map((entry) => (
                    <div key={entry.sequence}>
                      <time>
                        {new Date(entry.time).toLocaleTimeString("zh-CN")}
                      </time>
                      <span>{entry.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="terminal-empty">
                    等待运行日志。任务开始后将在此显示执行过程。
                  </p>
                )}
              </div>
              {viewedRun?.id !== task.latestRun?.id ? (
                <button
                  className="secondary"
                  onClick={() => setSelectedRunId(null)}
                >
                  查看最新运行
                </button>
              ) : viewedRun && active.has(viewedRun.status) ? (
                <>
                  <label>
                    补充输入
                    <textarea
                      rows={2}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="补充信息或回答执行器的问题…"
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      className="danger secondary"
                      disabled={busy}
                      onClick={() =>
                        setConfirmAction({
                          title: "停止这次研究？已产生的材料会保留。",
                          action: async () => {
                            await api(`/runs/${viewedRun!.id}/stop`, "POST");
                            setConfirmAction(null);
                          },
                        })
                      }
                    >
                      <Square size={13} />
                      停止研究
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !input.trim()}
                      onClick={() =>
                        void perform(async () => {
                          await api(`/runs/${viewedRun!.id}/input`, "POST", {
                            text: input,
                          });
                          setInput("");
                        }, "补充信息已发送")
                      }
                    >
                      发送输入
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <details className="resume-details">
                  <summary>
                    继续研究与配置 <ChevronDown size={14} />
                  </summary>
                  <label>
                    继续研究的要求
                    <textarea
                      rows={3}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="指出需要继续完善的部分…"
                    />
                  </label>
                  {resumeConfig && (
                    <details className="followup-configuration">
                      <summary>
                        调整本轮报告与执行设置（可选）
                        <ChevronDown size={14} />
                      </summary>
                      <p className="field-hint">
                        默认继承最新运行配置，保留原任务约束。本轮补充要求在上方填写。
                      </p>
                      <ConfigEditor
                        hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                        profile={resumeContentKind === "glossary" ? "glossary" : resumeContentKind === "verify" ? "verify" : "report"}
                        value={resumeConfig}
                        change={setResumeConfig}
                        models={models}
                        templates={state?.templates}
                      />
                    </details>
                  )}
                  <div className="form-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditor({
                          kind: "task",
                          requestId: crypto.randomUUID(),
                          title: task.title,
                          description: task.description,
                          priority: "normal",
                          tags: task.tags,
                          config: viewedRun?.config ?? task.config,
                        });
                        setSelectedTask(null);
                      }}
                    >
                      复用为新研究
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !input.trim()}
                      onClick={() =>
                        void perform(async () => {
                          await api(`/tasks/${task.id}/resume`, "POST", {
                            instructions: input,
                            config: resumeConfig,
                          });
                          setInput("");
                        }, "继续研究已提交")
                      }
                    >
                      <Play size={14} />
                      继续研究
                    </button>
                  </div>
                </details>
              )}
              <details>
                <summary>
                  运行历史 <ChevronDown size={14} />
                </summary>
                {task.runs.map((run) => (
                  <div className="history-run" key={run.id}>
                    <span className={`status ${run.status}`}>
                      {statusLabels[run.status]}
                    </span>
                    {configSummary(run.config)}
                    <span className="muted">{date(run.createdAt)}</span>
                    <small>{run.kind}</small>
                    <button
                      className="text-button"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      查看参数与日志
                    </button>
                  </div>
                ))}
              </details>
            </section>
          )}
          {state && section === "tasks" && selectedTask && !task && (
            <Empty
              title="研究任务不存在"
              description="该任务可能已被移除，可以返回任务列表继续查看。"
              action={
                <button
                  className="secondary"
                  onClick={() => setSelectedTask(null)}
                >
                  返回研究任务
                </button>
              }
            />
          )}
      {section === "artifacts" && selectedArtifact && artifact && (
        <section className="artifact-reader-page" aria-label="产出物阅读">
          <div className="reader-toolbar">
            <span className="muted">
              {date(artifact.createdAt)} ·{" "}
              {artifact.parentArtifactId ? "衍生版本" : "研究产出"}
            </span>
            <a
              className="secondary"
              href={`/api/artifacts/${artifact.id}/download`}
            >
              <ArrowDownToLine size={14} />
              下载
            </a>
            {formatLinks(artifact)}
            {artifactFormat(artifact) === "md" && !state?.artifacts.some((file) => file.convertedFromArtifactId === artifact.id && artifactFormat(file) === "pdf") && (
              <button className="secondary" disabled={busy} onClick={() => void convertPdf(artifact)}>
                {convertingArtifact === artifact.id ? "正在转换…" : "转成 PDF"}
              </button>
            )}
            <button
              className="primary"
              disabled={artifactFormat(artifact) !== "md"}
              onClick={() => setFollowup(readFollowupDraft())}
            >
              <Sparkles size={14} />
              继续探索
            </button>
          </div>
          <div className="modal-body">
            {artifact.parentArtifactId && (
              <a
                className="text-button"
                href={artifactPageHash(artifact.parentArtifactId)}
                target="_blank" rel="noopener noreferrer"
              >
                <ArrowLeft size={13} />
                查看来源版本
              </a>
            )}
            {artifactFormat(artifact) === "pdf" ? (
              <Suspense fallback={<p className="muted">正在加载 PDF 阅读器…</p>}>
                <PdfReader artifactId={artifact.id} />
              </Suspense>
            ) : artifactFormat(artifact) !== "md" ? (
              <a href={artifactHref(artifact)}>下载产出物</a>
            ) : contentLoading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" />
                正在读取报告
              </div>
            ) : contentError ? (
              <div className="alert error">{contentError}</div>
            ) : (
              <article
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(reportHtml(content, artifact.id), {
                    FORBID_TAGS: [
                      "iframe",
                      "style",
                      "input",
                      "form",
                      "video",
                      "audio",
                    ],
                  }),
                }}
              />
            )}
          </div>
        </section>
      )}
          {state && section === "artifacts" && selectedArtifact && !artifact && (
            <Empty title="产出物不存在" description="该产出物可能已被移除，可返回列表查看其他成果。" />
          )}
          <footer className="page-footer">
            <span>
              深研 <span className="footer-separator">/</span> 为深入思考而设计
            </span>
            <span>LOCAL RESEARCH WORKSPACE</span>
          </footer>
        </main>
      </div>
      {editor && state && (
        <Modal
          title={
            editor.kind === "task"
              ? "开始一次研究"
              : `${editor.id ? "编辑" : "新建"}${editor.kind === "topic" ? "课题" : "任务模板"}`
          }
          close={() => {
            if (!busy) setEditor(null);
          }}
          wide
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(
                async () => {
                  if (editor.kind === "task") {
                    const response = editor.id?.startsWith("topic:")
                      ? await api<{ task: Task }>(
                          `/topics/${editor.id.slice(6)}/start`,
                          "POST",
                          {
                            config: editor.config,
                            requestId: editor.requestId,
                          },
                        )
                      : await api<{ task: Task }>("/tasks", "POST", {
                          ...editor,
                          requestId: editor.requestId,
                        });
                    setSelectedTask(response.task.id);
                    setResumeConfig(
                      response.task.latestRun?.config ?? response.task.config,
                    );
                    setSection("tasks");
                  } else if (editor.kind === "template")
                    await api(
                      `/templates${editor.id ? `/${editor.id}` : ""}`,
                      editor.id ? "PATCH" : "POST",
                      { name: editor.title, config: editor.config },
                    );
                  else
                    await api(
                      `/topics${editor.id ? `/${editor.id}` : ""}`,
                      editor.id ? "PATCH" : "POST",
                      editor,
                    );
                  if (editor.kind === "topic") setSection("topics");
                  setEditor(null);
                },
                editor.kind === "task" ? "研究已提交" : "已保存",
              );
            }}
          >
            <div className="modal-body">
              <label>
                {editor.kind === "template" ? "模板名称" : "研究主题"}
                <input
                  required
                  readOnly={editor.id?.startsWith("topic:")}
                  maxLength={300}
                  value={editor.title}
                  onChange={(event) =>
                    setEditor({ ...editor, title: event.target.value })
                  }
                  placeholder={
                    editor.kind === "template"
                      ? "例如，技术原理深度研究"
                      : "你想深入理解什么？"
                  }
                />
              </label>
              {editor.kind !== "template" && (
                <>
                  <label>
                    问题背景与研究目标
                    <textarea
                      rows={3}
                      readOnly={editor.id?.startsWith("topic:")}
                      value={editor.description}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          description: event.target.value,
                        })
                      }
                      placeholder="描述关心的具体问题、已有背景和期望结果…"
                    />
                  </label>
                  {editor.kind === "topic" && (
                    <label>
                      优先级
                      <select
                        value={editor.priority}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            priority: event.target.value as Topic["priority"],
                          })
                        }
                      >
                        <option value="normal">普通</option>
                        <option value="high">高优先级</option>
                        <option value="low">低优先级</option>
                      </select>
                    </label>
                  )}
                  {editor.id?.startsWith("topic:") ? (
                    chips(editor.tags)
                  ) : (
                    <TagPicker
                      tags={state.tags}
                      value={editor.tags}
                      change={(tags) => setEditor({ ...editor, tags })}
                    />
                  )}
                </>
              )}
              <div className="form-section-label">研究配置</div>
              {modelWarning && (
                <p className="field-hint warning-text">{modelWarning}</p>
              )}
              <ConfigEditor
                hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                value={editor.config}
                change={(config) => setEditor({ ...editor, config })}
                models={models}
                templates={editor.kind === "template" ? [] : state.templates}
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : editor.kind === "task" ? (
                  <Play size={14} />
                ) : (
                  <Check size={15} />
                )}
                {editor.kind === "task" ? "开始研究" : "保存"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {followup && artifact && (
        <Modal
          title="从这份报告继续探索"
          close={() => {
            if (!busy) {
              setFollowup(null);
              setJob(null);
            }
          }}
          wide
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                const result = await api<{
                  task?: Task;
                  topic?: Topic;
                  job?: CandidateJob;
                }>(`/artifacts/${artifact.id}/followup`, "POST", followup);
                if (result.job) {
                  setJob(result.job);
                  setCandidateSelection(
                    result.job.candidates.map((item) => item.id),
                  );
                } else {
                  setFollowup(null);
                  setSelectedArtifact(null);
                  if (result.task) {
                    setSelectedTask(result.task.id);
                    setResumeConfig(
                      result.task.latestRun?.config ?? result.task.config,
                    );
                    setSection("tasks");
                  } else setSection("topics");
                }
              });
            }}
          >
            <div className="modal-body">
              <div className="intent-options">
                {(
                  [
                    ["rewrite", "重写报告", "调整表达与结构"],
                    ["glossary", "提取术语", "梳理概念与定义"],
                    ["verify", "核验与更新", "补查观点与证据"],
                    ["deepen", "深化问题", "保存深入研究方向"],
                    ["derive", "衍生课题", "提炼可研究的问题"],
                  ] as const
                ).map(([id, label, description]) => (
                  <button
                    type="button"
                    className={
                      followup.intent === id ? "intent selected" : "intent"
                    }
                    key={id}
                    onClick={() => {
                      setFollowup(readFollowupDraft(id));
                      setJob(null);
                    }}
                  >
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              <div className="followup-context">
                <strong>来源报告 · {artifact.title}</strong>
                <p>
                  {
                    FOLLOWUP_OPTIONS.find(
                      (option) => option.id === followup.intent,
                    )?.result
                  }
                </p>
              </div>
              {!job && (
                <>
                  {["deepen", "derive"].includes(followup.intent) && (
                    <fieldset className="chapter-selection">
                      <legend>按章节选择研究方向（可多选）</legend>
                      <p className="field-hint">所选章节包含其子章节，未选择时使用全文。</p>
                      {contentLoading ? <p className="muted">正在读取章节…</p> : contentError ? (
                        <p className="alert error">{contentError}</p>
                      ) : reportSections(content).length ? (
                        <div className="chapter-options">
                          {reportSections(content).map((chapter) => (
                            <label key={chapter.id} style={{ paddingLeft: `${12 + (chapter.level - 1) * 14}px` }}>
                              <input
                                type="checkbox"
                                checked={(followup.sectionIds ?? []).includes(chapter.id)}
                                onChange={(event) => setFollowup({
                                  ...followup,
                                  sectionIds: event.target.checked
                                    ? [...(followup.sectionIds ?? []), chapter.id]
                                    : (followup.sectionIds ?? []).filter((id) => id !== chapter.id),
                                })}
                              />
                              <span>{chapter.title}</span>
                            </label>
                          ))}
                        </div>
                      ) : <p className="muted">报告没有可识别的章节标题，将使用全文。</p>}
                      {!!followup.sectionIds?.length && (
                        <button type="button" className="text-button" onClick={() => setFollowup({ ...followup, sectionIds: [] })}>
                          清空选择，使用全文
                        </button>
                      )}
                    </fieldset>
                  )}
                  {followup.intent === "deepen" && (
                    <label>
                      新课题标题（可选）
                      <input
                        maxLength={200}
                        value={followup.topicTitle ?? ""}
                        onChange={(event) =>
                          setFollowup({
                            ...followup,
                            topicTitle: event.target.value,
                          })
                        }
                        placeholder={`${artifact.title} · 深化研究`}
                      />
                    </label>
                  )}
                  <label>
                    {
                      FOLLOWUP_OPTIONS.find(
                        (option) => option.id === followup.intent,
                      )?.requirementLabel
                    }
                    <textarea
                      rows={3}
                      required={followup.intent === "deepen" && !followup.sectionIds?.length}
                      value={followup.instructions}
                      onChange={(event) =>
                        setFollowup({
                          ...followup,
                          instructions: event.target.value,
                        })
                      }
                      placeholder={
                        FOLLOWUP_OPTIONS.find(
                          (option) => option.id === followup.intent,
                        )?.placeholder
                      }
                    />
                  </label>
                  {followup.intent === "glossary" && (
                    <div className="form-grid">
                      <label>
                        术语数量上限
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={followup.count}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              count: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        解释深度
                        <select
                          value={followup.glossaryDepth ?? "standard"}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              glossaryDepth: event.target
                                .value as FollowupInput["glossaryDepth"],
                            })
                          }
                        >
                          <option value="brief">简要定义</option>
                          <option value="standard">定义、作用与例子</option>
                          <option value="technical">
                            机制、边界与概念关联
                          </option>
                        </select>
                      </label>
                      <label>
                        组织方式
                        <select
                          value={followup.glossaryLayout ?? "grouped"}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              glossaryLayout: event.target
                                .value as FollowupInput["glossaryLayout"],
                            })
                          }
                        >
                          <option value="grouped">按主题分组</option>
                          <option value="alphabetical">按字母顺序</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {followup.intent === "verify" && (
                    <div className="form-grid">
                      <label>
                        核验范围
                        <select
                          value={followup.verifyScope ?? "key"}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              verifyScope: event.target
                                .value as FollowupInput["verifyScope"],
                            })
                          }
                        >
                          <option value="key">关键观点与数据</option>
                          <option value="all">全部可核验主张</option>
                        </select>
                      </label>
                      <label>
                        信息截止日期（可选）
                        <input
                          type="date"
                          value={followup.asOfDate ?? ""}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              asOfDate: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  {followup.intent === "derive" && (
                    <section className="config-group">
                      <h4>本次候选生成</h4>
                      <label>
                        候选课题数量
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={followup.count}
                          onChange={(event) =>
                            setFollowup({
                              ...followup,
                              count: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <ConfigEditor
                        hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                        profile="execution"
                        value={candidateExecutionConfig(followup)}
                        change={(config) =>
                          setFollowup({
                            ...followup,
                            generation: {
                              model: config.model,
                              reasoningEffort: config.reasoningEffort,
                              budgetMinutes: config.budgetMinutes,
                            },
                          })
                        }
                        models={models}
                      />
                    </section>
                  )}
                  <details className="followup-configuration">
                    <summary>
                      {followup.intent === "derive" ||
                      followup.intent === "deepen"
                        ? "未来课题的研究配置（可选）"
                        : followup.intent === "glossary"
                          ? "本轮执行、读者与资料设置（可选）"
                          : "本轮报告与执行设置（可选）"}
                      <ChevronDown size={14} />
                    </summary>
                    <p className="field-hint">
                      {followup.intent === "derive" ||
                      followup.intent === "deepen"
                        ? "默认继承来源研究，保存为课题后使用。候选可按需单独调整。"
                        : "默认继承适用配置，本次要求在上方填写。原任务提示词由本轮处理目标替换。"}
                    </p>
                    <ConfigEditor
                      hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                      profile={
                        followup.intent === "derive" ||
                        followup.intent === "deepen"
                          ? "full"
                          : followup.intent === "glossary"
                            ? "glossary"
                            : followup.intent === "verify"
                              ? "verify"
                              : "report"
                      }
                      value={followup.config}
                      change={(config) => setFollowup({ ...followup, config })}
                      models={models}
                      templates={state?.templates}
                    />
                  </details>
                </>
              )}
              {job && (
                <section className="candidate-section">
                  <h3>
                    {active.has(job.status) ? "正在提炼候选课题…" : "候选课题"}
                  </h3>
                  {active.has(job.status) && (
                    <p className="field-hint">
                      <LoaderCircle className="spin" size={14} />
                      保持当前窗口，候选生成后会自动显示。
                    </p>
                  )}
                  {job.error && <div className="alert error">{job.error}</div>}
                  {job.candidates.map((candidate) => (
                    <div className="candidate" key={candidate.id}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={candidateSelection.includes(candidate.id)}
                          disabled={!!candidate.savedTopicId}
                          onChange={(event) =>
                            setCandidateSelection(
                              event.target.checked
                                ? [...candidateSelection, candidate.id]
                                : candidateSelection.filter(
                                    (id) => id !== candidate.id,
                                  ),
                            )
                          }
                        />
                        {candidate.savedTopicId ? "已保存" : "保存为课题"}
                      </label>
                      <input
                        aria-label="候选课题名称"
                        value={candidate.title}
                        disabled={!!candidate.savedTopicId}
                        onChange={(event) =>
                          setJob({
                            ...job,
                            candidates: job.candidates.map((item) =>
                              item.id === candidate.id
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <textarea
                        aria-label="候选课题描述"
                        value={candidate.description}
                        disabled={!!candidate.savedTopicId}
                        onChange={(event) =>
                          setJob({
                            ...job,
                            candidates: job.candidates.map((item) =>
                              item.id === candidate.id
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <label>
                        优先级
                        <select
                          value={candidate.priority}
                          disabled={!!candidate.savedTopicId}
                          onChange={(event) =>
                            setJob({
                              ...job,
                              candidates: job.candidates.map((item) =>
                                item.id === candidate.id
                                  ? {
                                      ...item,
                                      priority: event.target
                                        .value as Topic["priority"],
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="normal">普通</option>
                          <option value="high">高优先级</option>
                          <option value="low">低优先级</option>
                        </select>
                      </label>
                      {!candidate.savedTopicId && (
                        <TagPicker
                          tags={state?.tags ?? []}
                          value={candidate.tags}
                          change={(tags) =>
                            setJob({
                              ...job,
                              candidates: job.candidates.map((item) =>
                                item.id === candidate.id
                                  ? { ...item, tags }
                                  : item,
                              ),
                            })
                          }
                        />
                      )}
                      {!candidate.savedTopicId && (
                        <details className="followup-configuration">
                          <summary>
                            单独调整该课题的研究配置（可选）
                            <ChevronDown size={14} />
                          </summary>
                          <ConfigEditor
                            hiddenTemplateIds={state?.hiddenTaskTemplateIds}
                            value={candidate.config}
                            change={(config) =>
                              setJob({
                                ...job,
                                candidates: job.candidates.map((item) =>
                                  item.id === candidate.id
                                    ? { ...item, config }
                                    : item,
                                ),
                              })
                            }
                            models={models}
                          />
                        </details>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setFollowup(null);
                  setJob(null);
                }}
                disabled={busy}
              >
                关闭
              </button>
              {job ? (
                <>
                  {!active.has(job.status) && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setJob(null);
                        setCandidateSelection([]);
                      }}
                    >
                      调整并重新生成
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      busy ||
                      active.has(job.status) ||
                      !candidateSelection.length
                    }
                    onClick={() =>
                      void perform(async () => {
                        await api(`/candidate-jobs/${job.id}/save`, "POST", {
                          candidates: job.candidates.filter(
                            (item) =>
                              candidateSelection.includes(item.id) &&
                              !item.savedTopicId,
                          ),
                        });
                        setJob(null);
                        setFollowup(null);
                        setSelectedArtifact(null);
                        setSection("topics");
                      }, "候选课题已保存")
                    }
                  >
                    <Check size={15} />
                    保存所选课题
                  </button>
                </>
              ) : (
                <button className="primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}{" "}
                  {followup.intent === "derive"
                    ? "生成候选课题"
                    : followup.intent === "deepen"
                      ? "保存深化课题"
                      : "提交后续研究"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {tagEditor && (
        <Modal
          title={tagEditor.id ? "编辑标签" : "新建标签"}
          close={() => setTagEditor(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await api(
                  `/tags${tagEditor.id ? `/${tagEditor.id}` : ""}`,
                  tagEditor.id ? "PATCH" : "POST",
                  tagEditor,
                );
                setTagEditor(null);
              }, "标签已保存");
            }}
          >
            <div className="modal-body">
              <label>
                标签名称
                <input
                  required
                  maxLength={60}
                  value={tagEditor.name}
                  onChange={(event) =>
                    setTagEditor({ ...tagEditor, name: event.target.value })
                  }
                />
              </label>
              <label>
                标签颜色
                <input
                  type="color"
                  value={tagEditor.color}
                  onChange={(event) =>
                    setTagEditor({ ...tagEditor, color: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="primary" disabled={busy}>
                保存标签
              </button>
            </div>
          </form>
        </Modal>
      )}
      {folderEditor && (
        <Modal
          title={folderEditor.id ? "编辑目录" : "新建目录"}
          close={() => setFolderEditor(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await api(
                  `/folders${folderEditor.id ? `/${folderEditor.id}` : ""}`,
                  folderEditor.id ? "PATCH" : "POST",
                  folderEditor,
                );
                setFolderEditor(null);
              }, "目录已保存");
            }}
          >
            <div className="modal-body">
              <label>
                目录名称
                <input
                  required
                  value={folderEditor.name}
                  onChange={(event) =>
                    setFolderEditor({
                      ...folderEditor,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                上级目录
                <select
                  value={folderEditor.parentId ?? ""}
                  onChange={(event) =>
                    setFolderEditor({
                      ...folderEditor,
                      parentId: event.target.value || null,
                    })
                  }
                >
                  <option value="">顶级目录</option>
                  {state?.folders
                    .filter((item) => item.id !== folderEditor.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              {folderEditor.id && (
                <button
                  type="button"
                  className="danger secondary"
                  onClick={() => {
                    remove(
                      `/folders/${folderEditor.id}`,
                      `删除目录“${folderEditor.name}”？`,
                    );
                    setFolderEditor(null);
                  }}
                >
                  删除目录
                </button>
              )}
              <button className="primary" disabled={busy}>
                保存目录
              </button>
            </div>
          </form>
        </Modal>
      )}
      {artifactEditor && (
        <Modal title="编辑产出物" close={() => setArtifactEditor(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await api(`/artifacts/${artifactEditor.id}`, "PATCH", {
                  name: artifactEditor.name,
                  tags: artifactEditor.tags,
                  folderId: artifactEditor.folderId,
                });
                setArtifactEditor(null);
              }, "产出物已更新");
            }}
          >
            <div className="modal-body">
              <label>
                显示名称
                <input
                  required
                  value={artifactEditor.name}
                  onChange={(event) =>
                    setArtifactEditor({
                      ...artifactEditor,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                归档目录
                <select
                  value={artifactEditor.folderId ?? ""}
                  onChange={(event) =>
                    setArtifactEditor({
                      ...artifactEditor,
                      folderId: event.target.value || null,
                    })
                  }
                >
                  <option value="">未归档</option>
                  {state?.folders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <TagPicker
                tags={state?.tags ?? []}
                value={artifactEditor.tags}
                change={(tags) =>
                  setArtifactEditor({ ...artifactEditor, tags })
                }
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="danger secondary"
                onClick={() => {
                  remove(
                    `/artifacts/${artifactEditor.id}`,
                    `删除产出物“${artifactEditor.name}”？`,
                  );
                  setArtifactEditor(null);
                }}
              >
                删除产出物
              </button>
              <button className="primary" disabled={busy}>
                保存更改
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmAction && (
        <Modal
          title="确认操作"
          close={() => {
            if (!busy) setConfirmAction(null);
          }}
        >
          <div className="modal-body">
            <p>{confirmAction.title}</p>
          </div>
          <div className="modal-footer">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirmAction(null)}
            >
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void perform(confirmAction.action, "操作已完成")}
            >
              确认
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function TagPicker({
  tags,
  value,
  change,
}: {
  tags: WorkbenchState["tags"];
  value: string[];
  change: (tags: string[]) => void;
}) {
  return (
    <label>
      标签
      <span className="style-options">
        {tags.length ? (
          tags.map((tag) => (
            <button
              type="button"
              key={tag.id}
              className={
                value.includes(tag.id)
                  ? "style-option selected"
                  : "style-option"
              }
              onClick={() =>
                change(
                  value.includes(tag.id)
                    ? value.filter((id) => id !== tag.id)
                    : [...value, tag.id],
                )
              }
            >
              <span className="tag-dot" style={{ background: tag.color }} />
              {tag.name}
              {value.includes(tag.id) && <Check size={12} />}
            </button>
          ))
        ) : (
          <span className="field-hint">还没有标签，可前往标签管理创建。</span>
        )}
      </span>
    </label>
  );
}
