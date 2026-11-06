import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import { DEFAULT_CONFIG } from "./models.js";
import { copilotExe, dataRoot, ensureDirectories } from "./paths.js";
import { ensureProxy, proxyConnection } from "./proxy.js";
import { createRunGateway } from "./gateway.js";
import { buildCandidatePrompt, parseCandidateResponse } from "./followups.js";
import type { FollowupInput } from "../shared/types.js";
import { candidateExecutionConfig } from "../shared/followup.js";
import { selectedReportScope } from "../shared/report-sections.js";

ensureDirectories();
const store = new Store(join(dataRoot, "workbench.sqlite"), DEFAULT_CONFIG);
const jobId = process.argv[2];
const job = store.candidateJob(jobId);
if (!job || job.status !== "queued") {
  store.close();
  process.exit(1);
}
const directory = join(dataRoot, "candidates", job.id);
let gateway: Awaited<ReturnType<typeof createRunGateway>> | undefined;
let heartbeat: NodeJS.Timeout | undefined;
let upstreamKey = "";

try {
  const { title, report, input } = JSON.parse(
    readFileSync(join(directory, "input.json"), "utf8"),
  ) as { title: string; report: string; input: FollowupInput };
  const executionConfig = candidateExecutionConfig(input);
  while (!store.claimCandidate(job.id)) {
    if (store.candidateJob(job.id)?.status !== "queued") {
      store.close();
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  writeFileSync(
    join(directory, "worker.json"),
    JSON.stringify({ pid: process.pid }),
  );
  writeFileSync(join(directory, "heartbeat"), String(Date.now()));
  heartbeat = setInterval(
    () => writeFileSync(join(directory, "heartbeat"), String(Date.now())),
    5000,
  );
  await ensureProxy();
  upstreamKey = proxyConnection().key;
  gateway = await createRunGateway(executionConfig, () => {});
  const home = join(directory, "copilot");
  mkdirSync(home, { recursive: true });
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
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
  }
  Object.assign(env, {
    COPILOT_HOME: home,
    COPILOT_MODEL: executionConfig.model,
    COPILOT_PROVIDER_TYPE: "openai",
    COPILOT_PROVIDER_WIRE_API: "responses",
    COPILOT_PROVIDER_TRANSPORT: "http",
    COPILOT_PROVIDER_BASE_URL: gateway.url,
    COPILOT_PROVIDER_API_KEY: gateway.key,
    COPILOT_TELEMETRY_DISABLED: "true",
    NO_COLOR: "1",
  });
  const args = [
    "--output-format",
    "json",
    "--no-custom-instructions",
    "--disable-builtin-mcps",
    "--trust-folder",
    "--no-ask-user",
    "--no-auto-update",
    "--secret-env-vars=COPILOT_PROVIDER_API_KEY",
  ];
  if (executionConfig.reasoningEffort !== "default")
    args.push("--reasoning-effort", executionConfig.reasoningEffort);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(copilotExe, args, {
      cwd: directory,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    let failure = "";
    const fail = (message: string) => {
      failure = message;
      child.kill();
    };
    const timer = setTimeout(
      () => fail("候选课题生成已达到时间预算"),
      executionConfig.budgetMinutes * 60000,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout) > 2 * 1024 * 1024)
        fail("候选课题输出超出大小限制");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.on("error", (error) => fail(error.message));
    child.stdin.end(buildCandidatePrompt(title, report, input));
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure || code !== 0)
        reject(new Error(failure || `候选生成进程退出 ${code} ${stderr}`));
      else resolve(stdout);
    });
  });
  const artifact = store.artifact(job.artifactId);
  if (!artifact) throw new Error("来源报告已删除");
  const candidates = parseCandidateResponse(
    output,
    input.count,
    input.config,
    artifact.tags,
  );
  const scope = selectedReportScope(report, input.sectionIds);
  if (scope.titles.length) {
    for (const candidate of candidates)
      candidate.description += `\n\n来源章节限定 ${scope.titles.join("、")}，围绕这些章节及其子章节继续研究。`;
  }
  store.updateCandidateJob(job.id, { status: "completed", candidates });
} catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [gateway?.key, upstreamKey])
    if (secret) message = message.split(secret).join("[REDACTED]");
  if (store.candidateJob(job.id))
    store.updateCandidateJob(job.id, {
      status: "failed",
      error: message.slice(0, 4000),
    });
} finally {
  if (heartbeat) clearInterval(heartbeat);
  gateway?.server.closeAllConnections();
  gateway?.server.close();
  store.close();
}
