import type { CONFIG_OPTIONS } from "./config.js";
export const STYLE_OPTIONS = [
  {
    id: "concise",
    label: "精简摘要",
    description: "摘要直达结论，正文保留证据与深度",
  },
  {
    id: "tutorial",
    label: "入门讲解",
    description: "解释术语，用贯穿案例逐步展开",
  },
  {
    id: "technical",
    label: "技术深挖",
    description: "分析机制、源码、边界与实现代价",
  },
  {
    id: "comparison",
    label: "方案比较",
    description: "统一维度比较选择与适用条件",
  },
  {
    id: "literature",
    label: "论文综述",
    description: "核对原始论文、实验条件与覆盖缺口",
  },
] as const;
export type Style = (typeof STYLE_OPTIONS)[number]["id"];
export type Effort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
export interface ModelInfo {
  id: string;
  label: string;
  reasoningEfforts: Effort[];
  capabilitySource: "catalog" | "documentation" | "conservative";
}
export interface ResearchConfig {
  taskTemplateId: string;
  taskTemplateName: string;
  taskInstructions: string;
  reportType: (typeof CONFIG_OPTIONS.reportType)[number]["id"];
  depth: (typeof CONFIG_OPTIONS.depth)[number]["id"];
  lengthPreset: (typeof CONFIG_OPTIONS.lengthPreset)[number]["id"] | "legacy";
  focusAreas: (typeof CONFIG_OPTIONS.focusAreas)[number]["id"][];
  readerRole: (typeof CONFIG_OPTIONS.readerRole)[number]["id"];
  familiarity: (typeof CONFIG_OPTIONS.familiarity)[number]["id"];
  sourcePreference: (typeof CONFIG_OPTIONS.sourcePreference)[number]["id"];
  reuseStrategy: (typeof CONFIG_OPTIONS.reuseStrategy)[number]["id"];
  model: string;
  reasoningEffort: Effort;
  styles: Style[];
  audience: string;
  length: string;
  workingDirectory: string;
  outputDirectory: string;
  budgetMinutes: number;
  permission: "limited" | "full";
  format: "markdown";
}
export interface Tag {
  id: string;
  name: string;
  color: string;
}
export interface Topic {
  id: string;
  title: string;
  description: string;
  priority: "high" | "normal" | "low";
  tags: string[];
  config: ResearchConfig;
  createdAt: string;
  updatedAt: string;
  startedTaskId?: string;
  archived?: boolean;
  sourceArtifactId?: string;
  sourceSectionIds?: string[];
}
export interface Template {
  id: string;
  name: string;
  config: ResearchConfig;
  createdAt: string;
  updatedAt: string;
}
export type RunStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting_input"
  | "finalizing"
  | "completed"
  | "failed"
  | "stopped"
  | "interrupted";
export type RunKind = "research" | "resume" | "rewrite" | "glossary" | "verify";
export interface Run {
  id: string;
  taskId: string;
  kind: RunKind;
  contentKind?: Exclude<RunKind, "resume">;
  contentGoal?: string;
  status: RunStatus;
  config: ResearchConfig;
  sessionId: string;
  accountScope?: string;
  prompt: string;
  directory: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  pid?: number;
  inputTokens?: number;
  outputTokens?: number;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  tags: string[];
  topicId?: string;
  createdAt: string;
  config: ResearchConfig;
  latestRun?: Run;
  runs: Run[];
}
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}
export interface Artifact {
  id: string;
  taskId: string;
  runId: string;
  title: string;
  name: string;
  relativePath: string;
  folderId: string | null;
  tags: string[];
  createdAt: string;
  parentArtifactId?: string;
  convertedFromArtifactId?: string;
}
export type FollowupIntent =
  | "rewrite"
  | "glossary"
  | "deepen"
  | "verify"
  | "derive";
export interface FollowupInput {
  intent: FollowupIntent;
  feedback: string[];
  instructions: string;
  count: number;
  config: ResearchConfig;
  generation?: Pick<
    ResearchConfig,
    "model" | "reasoningEffort" | "budgetMinutes"
  >;
  topicTitle?: string;
  glossaryDepth?: "brief" | "standard" | "technical";
  glossaryLayout?: "grouped" | "alphabetical";
  verifyScope?: "key" | "all";
  asOfDate?: string;
  sectionIds?: string[];
}
export interface Candidate {
  id: string;
  title: string;
  description: string;
  priority: Topic["priority"];
  tags: string[];
  config: ResearchConfig;
  savedTopicId?: string;
}
export interface CandidateJob {
  id: string;
  artifactId: string;
  sourceSectionIds?: string[];
  status: RunStatus;
  candidates: Candidate[];
  error?: string;
  createdAt: string;
}
export interface AccountStatus {
  signedIn: boolean;
  plan: string | null;
  account: string | null;
  proxyReady: boolean;
  copilotInstalled: boolean;
  loginStatus: "idle" | "waiting" | "success" | "error";
  loginUrl?: string;
  error?: string;
}
export interface WorkbenchState {
  hiddenTaskTemplateIds: string[];
  candidateJobs: CandidateJob[];
  topics: Topic[];
  tags: Tag[];
  templates: Template[];
  tasks: Task[];
  artifacts: Artifact[];
  folders: Folder[];
  settings: ResearchConfig;
}
export interface LogEntry {
  sequence: number;
  time: string;
  text: string;
  type: string;
}
