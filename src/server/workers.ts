import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./store.js";
import { dataRoot } from "./paths.js";
export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
function heartbeatAge(path: string, createdAt: string, now: number) {
  return (
    now -
    (existsSync(path)
      ? Number(readFileSync(path, "utf8"))
      : Date.parse(createdAt))
  );
}
export function reconcileWorkers(
  store: Store,
  now = Date.now(),
  alive = processAlive,
) {
  const active = ["starting", "running", "waiting_input", "finalizing"];
  for (const run of store.runs().filter((run) => active.includes(run.status))) {
    if (
      heartbeatAge(
        join(run.directory, "heartbeat"),
        run.startedAt ?? run.createdAt,
        now,
      ) > 60000 &&
      (!run.pid || !alive(run.pid))
    )
      store.updateRun(run.id, {
        status: "interrupted",
        error: "运行进程已结束，可从保存的会话续写",
        finishedAt: new Date(now).toISOString(),
      });
  }
  for (const job of store
    .candidateJobs()
    .filter((job) => active.includes(job.status))) {
    const directory = join(dataRoot, "candidates", job.id);
    const info = join(directory, "worker.json");
    const pid = existsSync(info)
      ? JSON.parse(readFileSync(info, "utf8")).pid
      : undefined;
    if (
      heartbeatAge(join(directory, "heartbeat"), job.createdAt, now) > 60000 &&
      (!pid || !alive(pid))
    )
      store.updateCandidateJob(job.id, {
        status: "interrupted",
        error: "候选提炼进程已结束，请重新生成",
      });
  }
}
export function queuedCandidateNeedsWorker(
  id: string,
  createdAt: string,
  now = Date.now(),
) {
  const directory = join(dataRoot, "candidates", id);
  const metadata = join(directory, "worker.json");
  if (existsSync(metadata)) {
    const { pid } = JSON.parse(readFileSync(metadata, "utf8"));
    if (pid && processAlive(pid)) return false;
  }
  const marker = join(directory, "launch");
  const last = existsSync(marker)
    ? Number(readFileSync(marker, "utf8"))
    : Date.parse(createdAt);
  return now - last > 5000 && existsSync(join(directory, "input.json"));
}
