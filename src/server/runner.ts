import pty from "node-pty";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { Store } from "./store.js";
import { DEFAULT_CONFIG } from "./models.js";
import {
  copilotExe,
  copilotHome,
  dataRoot,
  ensureDirectories,
} from "./paths.js";
import { ensureProxy, proxyConnection, accountFingerprint } from "./proxy.js";
import { checkSessionScope } from "./session-scope.js";
import { deliveredReport } from "./delivery.js";
import { createRunGateway } from "./gateway.js";
import { CompletionTracker, DeliveryGate } from "./lifecycle.js";
import { appendLog } from "./research.js";
import { trustDirectories } from "./copilot-config.js";

ensureDirectories();
const store = new Store(join(dataRoot, "workbench.sqlite"), DEFAULT_CONFIG);
const run = store.run(process.argv[2]);
if (!run || run.status !== "starting") process.exit(1);
const log = (type: string, text: string) =>
  appendLog(run.directory, type, text);
let quitting = false;
let stopping = false;
let finalError = "";
let child: pty.IPty | undefined;
let gateway: Awaited<ReturnType<typeof createRunGateway>> | undefined;
let interval: NodeJS.Timeout | undefined;
let timeout: NodeJS.Timeout | undefined;
const tracker = new CompletionTracker();
const delivery = new DeliveryGate();
const currentEvents = join(
  copilotHome,
  "session-state",
  run.sessionId,
  "events.jsonl",
);
let eventCursor = existsSync(currentEvents)
  ? readFileSync(currentEvents, "utf8").split("\n").filter(Boolean).length
  : 0;
let inputCursor = 0;
let completedAt = 0;
let returnedReport: string | undefined;
function submit(text: string) {
  child?.write(text);
  setTimeout(() => child?.write("\r"), 250);
}

function reportPaths() {
  const output = join(run!.directory, "deliverables");
  const direct = readdirSync(output)
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .map((file) => join(output, file));
  if (direct.length) return direct;
  const native = join(copilotHome, "session-state", run!.sessionId, "research");
  if (!existsSync(native)) return [];
  const eligible = readdirSync(native)
    .filter(
      (file) =>
        file.endsWith(".md") &&
        statSync(join(native, file)).mtimeMs >=
          Date.parse(run!.startedAt ?? run!.createdAt),
    )
    .sort();
  return eligible.map((file, index) => {
    const destination = join(
      output,
      index === 0 ? "report.md" : `report-${index + 1}.md`,
    );
    copyFileSync(join(native, file), destination);
    return destination;
  });
}
function registerReports() {
  const task = store.task(run!.taskId)!;
  if (!reportPaths().length && returnedReport) {
    writeFileSync(
      join(run!.directory, "deliverables/report.md"),
      returnedReport,
    );
    log("delivery", "工作台已保存研究代理返回的完整报告正文。");
  }
  const reports = reportPaths();
  if (!reports.length)
    throw new Error("本轮已结束，但尚未生成报告正文。可以续写要求完成交付。");
  for (const report of reports) {
    const text = readFileSync(report, "utf8");
    if (text.trim().length < 80)
      throw new Error("报告正文过短，交付未达标，可以继续完善");
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || task.title;
    const name =
      title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) + ".md";
    const existing = store
      .state()
      .artifacts.find(
        (a) =>
          a.runId === run!.id &&
          a.relativePath ===
            relative(run!.directory, report).replaceAll("\\", "/"),
      );
    const lineagePath = join(run!.directory, "source-artifact.json");
    const parentArtifactId = existsSync(lineagePath)
      ? JSON.parse(readFileSync(lineagePath, "utf8")).artifactId
      : undefined;
    if (!existing)
      store.createArtifact({
        taskId: task.id,
        runId: run!.id,
        title,
        name,
        relativePath: relative(run!.directory, report).replaceAll("\\", "/"),
        folderId: null,
        tags: task.tags,
        ...(parentArtifactId ? { parentArtifactId } : {}),
      });
    if (run!.config.outputDirectory) {
      mkdirSync(run!.config.outputDirectory, { recursive: true });
      copyFileSync(
        report,
        join(
          run!.config.outputDirectory,
          `${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100)}-${run!.id.slice(0, 8)}.md`,
        ),
      );
    }
  }
}
function finish(exitCode: number) {
  if (interval) clearInterval(interval);
  if (timeout) clearTimeout(timeout);
  try {
    if (stopping)
      store.updateRun(run!.id, {
        status: "stopped",
        finishedAt: new Date().toISOString(),
        error: finalError || undefined,
      });
    else if (finalError || exitCode !== 0)
      store.updateRun(run!.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: finalError || `Copilot 退出码 ${exitCode}`,
      });
    else {
      registerReports();
      store.updateRun(run!.id, {
        status: "completed",
        finishedAt: new Date().toISOString(),
      });
      log("complete", "报告已交付，会话已保留，可继续续写。");
    }
  } catch (error) {
    store.updateRun(run!.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: String(error instanceof Error ? error.message : error),
    });
  }
  gateway?.server.closeAllConnections();
  gateway?.server.close();
  store.close();
  process.exit(0);
}
function requestExit(reason = "") {
  if (quitting) return;
  quitting = true;
  finalError = reason;
  store.updateRun(run!.id, { status: "finalizing" });
  submit("/exit");
  setTimeout(() => {
    try {
      child?.kill();
    } catch {}
    finish(reason ? 1 : 0);
  }, 5000).unref();
}
try {
  await ensureProxy();
  const scopePath = join(copilotHome, `scope-${run.sessionId}.json`);
  const savedScope = existsSync(scopePath)
    ? JSON.parse(readFileSync(scopePath, "utf8"))
    : undefined;
  const working =
    run.config.workingDirectory || savedScope?.directory || run.directory;
  if (!existsSync(working)) throw new Error("研究工作目录不存在");
  const directory = resolve(working);
  const scope = {
    account: accountFingerprint(),
    directory:
      process.platform === "win32" ? directory.toLowerCase() : directory,
  };
  if (savedScope) checkSessionScope(savedScope, scope);
  else writeFileSync(scopePath, JSON.stringify(scope));
  store.updateRun(run.id, { accountScope: scope.account });
  const sourceContext = join(run.directory, "source-context.json");
  const sourceDirectories: string[] = existsSync(sourceContext)
    ? JSON.parse(readFileSync(sourceContext, "utf8")).directories
    : [];
  trustDirectories(copilotHome, [working, run.directory, ...sourceDirectories]);
  const upstreamKey = proxyConnection().key;
  gateway = await createRunGateway(run.config, (type, data) => {
    if (type === "model.completed") {
      const usage = data.usage as any;
      const current = store.run(run.id)!;
      store.updateRun(run.id, {
        inputTokens: (current.inputTokens ?? 0) + (usage?.input_tokens ?? 0),
        outputTokens: (current.outputTokens ?? 0) + (usage?.output_tokens ?? 0),
      });
      log(
        type,
        JSON.stringify({
          model: data.model,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
        }),
      );
    } else log(type, JSON.stringify(data));
  });
  const env = { ...process.env } as Record<string, string>;
  for (const key of Object.keys(env))
    if (
      key.startsWith("COPILOT_PROVIDER_") ||
      [
        "COPILOT_OFFLINE",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "COPILOT_GITHUB_TOKEN",
      ].includes(key)
    )
      delete env[key];
  Object.assign(env, {
    COPILOT_HOME: copilotHome,
    COPILOT_MODEL: run.config.model,
    COPILOT_PROVIDER_TYPE: "openai",
    COPILOT_PROVIDER_WIRE_API: "responses",
    COPILOT_PROVIDER_TRANSPORT: "http",
    COPILOT_PROVIDER_BASE_URL: gateway.url,
    COPILOT_PROVIDER_API_KEY: gateway.key,
    COPILOT_TELEMETRY_DISABLED: "true",
    NO_COLOR: "1",
  });
  const args = [
    "--no-auto-update",
    "--no-custom-instructions",
    "--disable-builtin-mcps",
    "--allow-all-tools",
    "--allow-all-urls",
    "--no-ask-user",
    "--secret-env-vars=COPILOT_PROVIDER_API_KEY",
  ];
  for (const directory of sourceDirectories) args.push("--add-dir", directory);
  writeFileSync(join(run.directory, "request.md"), run.prompt);
  for (const previous of store.task(run.taskId)?.runs ?? [])
    args.push("--add-dir", previous.directory);
  const brief = `请完整读取 ${join(run.directory, "request.md")}，按文件中的研究目标、资料与交付要求完成本轮任务。请将以下要求传达给研究代理：最终回复完整 Markdown 报告正文，整条回复用 <workbench_report> 和 </workbench_report> 各占一行包裹，由工作台保存。无需写入文件。`;
  if (run.config.reasoningEffort !== "default")
    args.push("--reasoning-effort", run.config.reasoningEffort);
  if (run.config.permission === "limited") args.push("--deny-tool", "shell");
  else args.push("--allow-all-paths");
  if (run.kind === "research")
    args.push("--session-id", run.sessionId, "-i", "/research " + brief);
  else args.push("--resume", run.sessionId, "-i", brief);
  child = pty.spawn(copilotExe, args, {
    name: "xterm-256color",
    cols: 130,
    rows: 40,
    cwd: working,
    env,
  });
  store.updateRun(run.id, { status: "running" });
  writeFileSync(join(run.directory, "heartbeat"), String(Date.now()));
  log(
    "start",
    `Copilot 原生研究 · ${run.config.model} · ${run.config.reasoningEffort}`,
  );
  child.onData((data) => {
    const safe = data
      .split(gateway!.key)
      .join("[REDACTED]")
      .split(upstreamKey)
      .join("[REDACTED]");
    appendFileSync(join(run.directory, "terminal.log"), safe);
  });
  child.onExit((event) => finish(event.exitCode));
  timeout = setTimeout(() => {
    stopping = true;
    finalError = "已达到运行时间预算，材料已保存";
    child?.write("\x03");
    setTimeout(() => child?.kill(), 2000).unref();
  }, run.config.budgetMinutes * 60000);
  interval = setInterval(() => {
    try {
      writeFileSync(join(run.directory, "heartbeat"), String(Date.now()));
      if (existsSync(join(run.directory, "stop.request")) && !stopping) {
        stopping = true;
        child?.write("\x03");
        setTimeout(() => child?.kill(), 2000).unref();
      }
      const inputPath = join(run.directory, "input.jsonl");
      if (existsSync(inputPath)) {
        const rows = readFileSync(inputPath, "utf8")
          .split("\n")
          .filter(Boolean);
        for (const row of rows.slice(inputCursor)) {
          const { text } = JSON.parse(row);
          submit(text);
          log("input", text);
        }
        inputCursor = rows.length;
      }
      if (existsSync(currentEvents)) {
        const lines = readFileSync(currentEvents, "utf8")
          .split("\n")
          .filter(Boolean);
        for (const line of lines.slice(eventCursor)) {
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            break;
          }
          eventCursor++;
          tracker.accept(event);
          const data = event.data ?? {};
          if (
            event.type === "assistant.message" &&
            typeof data.content === "string" &&
            !data.toolRequests?.length
          ) {
            returnedReport = deliveredReport(data.content) ?? returnedReport;
          }
          if (event.type === "assistant.message" && data.content)
            log("assistant", data.content);
          if (event.type === "tool.execution_start")
            log("tool", `${data.toolTitle ?? data.toolName}`);
          if (
            event.type === "tool.execution_complete" &&
            data.success === false
          )
            log("warning", "工具执行未成功，研究将记录相关缺口");
        }
      }
      if (tracker.error) requestExit(tracker.error);
      if (tracker.finished && !quitting && !stopping) {
        if (!completedAt) completedAt = Date.now();
        if (Date.now() - completedAt > 1500) {
          if (
            delivery.needsDelivery(reportPaths().length > 0 || !!returnedReport)
          ) {
            tracker.accept({ type: "assistant.turn_start" });
            completedAt = 0;
            log("delivery", "研究阶段结束，正在完成报告文件交付。");
            submit(
              `请调用研究代理完整读取 ${join(run.directory, "request.md")}，核对原研究结果后返回完整 Markdown 正文。请将这个交付协议完整传达给研究代理：整条最终回复只包含 <workbench_report> 换行、以一级标题开头的报告全文、换行 </workbench_report>。由工作台保存，无需写文件。`,
            );
          } else requestExit();
        }
      } else completedAt = 0;
    } catch (error) {
      log("warning", error instanceof Error ? error.message : String(error));
    }
  }, 600);
} catch (error) {
  finalError = error instanceof Error ? error.message : String(error);
  log("error", finalError);
  finish(1);
}
