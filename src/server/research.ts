import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import { DEFAULT_CONFIG, buildResearchPrompt } from "./models.js";
import { copilotHome, dataRoot, projectRoot } from "./paths.js";
import type { ResearchConfig, Task, Run, LogEntry } from "../shared/types.js";
import { reconcileWorkers, queuedCandidateNeedsWorker } from "./workers.js";

export const activeStatuses = [
  "starting",
  "running",
  "waiting_input",
  "finalizing",
];
export function appendLog(runDirectory: string, type: string, text: string) {
  const path = join(runDirectory, "logs.jsonl");
  const sequencePath = join(runDirectory, "sequence");
  const sequence = existsSync(sequencePath)
    ? Number(readFileSync(sequencePath, "utf8")) + 1
    : 1;
  const entry: LogEntry = {
    sequence,
    time: new Date().toISOString(),
    type,
    text,
  };
  appendFileSync(path, JSON.stringify(entry) + "\n");
  writeFileSync(sequencePath, String(sequence));
}
export function readLogs(run: Run, after = 0): LogEntry[] {
  const path = join(run.directory, "logs.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogEntry];
      } catch {
        return [];
      }
    })
    .filter((row) => row.sequence > after)
    .slice(-300);
}
export function runInput(
  goal: string,
  config: ResearchConfig,
  sessionId: string = randomUUID(),
  existingWorkspace?: string,
  kind: Run["kind"] = "research",
) {
  const directory = join(dataRoot, "runs", randomUUID());
  const workingDirectory =
    existingWorkspace || join(dataRoot, "workspaces", sessionId);
  mkdirSync(join(workingDirectory, "materials"), { recursive: true });
  const effectiveConfig = { ...config, workingDirectory, outputDirectory: "" };
  mkdirSync(join(directory, "deliverables"), { recursive: true });
  mkdirSync(join(directory, "materials"), { recursive: true });
  return {
    config: effectiveConfig,
    sessionId,
    directory,
    prompt: buildResearchPrompt(
      goal,
      effectiveConfig,
      join(directory, "deliverables"),
      kind,
    ),
  };
}
export function queueResearch(
  store: Store,
  task: Task,
  config: ResearchConfig,
  instructions: string,
  kind: Run["kind"] = "research",
  requestId?: string,
  sourceRun?: Run,
): Run {
  const last = sourceRun ?? task.runs[task.runs.length - 1];
  const sessionId = kind === "research" ? randomUUID() : last?.sessionId;
  if (
    kind !== "research" &&
    (!sessionId ||
      !existsSync(
        join(copilotHome, "session-state", sessionId, "events.jsonl"),
      ))
  )
    throw new Error("该任务尚无可恢复会话，请复用配置重新研究");
  const scopePath = join(copilotHome, `scope-${sessionId}.json`);
  const existingWorkspace =
    kind !== "research"
      ? last?.config.workingDirectory ||
        (existsSync(scopePath)
          ? JSON.parse(readFileSync(scopePath, "utf8")).directory
          : undefined)
      : undefined;
  const base = kind === "resume"
    ? [...task.runs].reverse().find((run) => run.kind !== "resume")
    : undefined;
  const contentKind = kind === "resume"
    ? last?.contentKind ?? (base?.kind !== "resume" ? base?.kind : undefined) ?? "research"
    : kind;
  const contentGoal = kind === "resume"
    ? last?.contentGoal ?? base?.contentGoal ??
      (base && ["rewrite", "glossary", "verify"].includes(contentKind)
        ? base.prompt.split("\n\n")[0]
        : undefined)
    : ["rewrite", "glossary", "verify"].includes(kind)
      ? instructions.split("\n\n")[0]
      : undefined;
  const input = runInput(
    kind === "resume" && contentGoal
      ? `${contentGoal}\n\n本轮补充要求\n${instructions}`
      : instructions,
    config,
    sessionId,
    existingWorkspace,
    contentKind,
  );
  const sourceContext = last && join(last.directory, "source-context.json");
  if (kind !== "research" && sourceContext && existsSync(sourceContext)) {
    writeFileSync(join(input.directory, "source-context.json"), readFileSync(sourceContext));
  }
  return store.createRun(task.id, { ...input, kind, contentKind, contentGoal }, requestId);
}
export function stopRun(store: Store, run: Run) {
  if (!["queued", ...activeStatuses].includes(run.status)) return;
  if (run.status === "queued") {
    store.updateRun(run.id, {
      status: "stopped",
      finishedAt: new Date().toISOString(),
    });
    return;
  }
  writeFileSync(join(run.directory, "stop.request"), "stop");
}
export function sendInput(run: Run, text: string) {
  if (!["running", "waiting_input"].includes(run.status))
    throw new Error("当前运行已结束，请使用续写");
  if (!text.trim() || text.length > 20000)
    throw new Error("请输入 1～20000 字的补充内容");
  appendFileSync(
    join(run.directory, "input.jsonl"),
    JSON.stringify({ text }) + "\n",
  );
}
export function startScheduler(store: Store) {
  let scheduling = false;
  const tick = () => {
    if (scheduling) return;
    scheduling = true;
    try {
      reconcileWorkers(store);
      if (store.runs().some((run) => activeStatuses.includes(run.status)))
        return;
      if (
        store.candidateJobs().some((job) => activeStatuses.includes(job.status))
      )
        return;
      for (const job of store
        .candidateJobs()
        .filter((job) => job.status === "queued")) {
        if (queuedCandidateNeedsWorker(job.id, job.createdAt)) {
          writeFileSync(
            join(dataRoot, "candidates", job.id, "launch"),
            String(Date.now()),
          );
          const worker = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              join(projectRoot, "src/server/candidate-runner.ts"),
              job.id,
            ],
            {
              cwd: projectRoot,
              detached: true,
              windowsHide: true,
              stdio: "ignore",
              env: { ...process.env, RESEARCH_DATA_DIR: dataRoot },
            },
          );
          worker.on("error", (error) =>
            store.updateCandidateJob(job.id, {
              status: "failed",
              error: error.message,
            }),
          );
          worker.unref();
        }
      }
      const next = store
        .runs()
        .filter((run) => run.status === "queued")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) return;
      if (!store.claimRun(next.id)) return;
      const child = spawn(
        process.execPath,
        ["--import", "tsx", join(projectRoot, "src/server/runner.ts"), next.id],
        {
          cwd: projectRoot,
          detached: true,
          windowsHide: true,
          stdio: "ignore",
          env: { ...process.env, RESEARCH_DATA_DIR: dataRoot },
        },
      );
      child.on("error", (error) =>
        store.updateRun(next.id, {
          status: "failed",
          error: error.message,
          finishedAt: new Date().toISOString(),
        }),
      );
      if (child.pid) store.updateRun(next.id, { pid: child.pid });
      child.unref();
    } finally {
      scheduling = false;
    }
  };
  const timer = setInterval(tick, 1000);
  tick();
  return () => clearInterval(timer);
}
