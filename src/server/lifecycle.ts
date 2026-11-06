import { realpathSync } from "node:fs";
import type { Server } from "node:http";
import { isAbsolute, resolve, relative, sep } from "node:path";
export class DeliveryGate {
  private attempted = false;
  needsDelivery(hasReport: boolean) {
    if (hasReport || this.attempted) return false;
    this.attempted = true;
    return true;
  }
}
export class CompletionTracker {
  error = "";
  private pending = new Set<string>();
  private rootEnded = false;
  private finalMessage = false;
  get finished() {
    return this.rootEnded && this.finalMessage && this.pending.size === 0;
  }
  accept(event: { type: string; data?: any }) {
    const data = event.data ?? {};
    const root = !data.parentToolCallId;
    if (event.type === "assistant.turn_start" && root) {
      this.rootEnded = false;
      this.finalMessage = false;
    }
    if (event.type === "assistant.message" && root)
      this.finalMessage = !!data.content?.trim() && !data.toolRequests?.length;
    if (event.type === "assistant.turn_end" && root) this.rootEnded = true;
    if (event.type === "tool.execution_start")
      this.pending.add(data.toolCallId);
    if (event.type === "tool.execution_complete")
      this.pending.delete(data.toolCallId);
    if (event.type === "session.error")
      this.error = data.message ?? data.error ?? "研究执行失败";
  }
}
export function safeFile(root: string, name: string): string {
  if (!name || isAbsolute(name) || /^[A-Za-z]:|^\\\\/.test(name))
    throw new Error("文件路径无效");
  const base = realpathSync(root);
  const lexical = relative(base, resolve(base, name));
  if (isAbsolute(lexical) || lexical === ".." || lexical.startsWith(".." + sep))
    throw new Error("文件路径超出产出物目录");
  const target = realpathSync(resolve(base, name));
  const rel = relative(base, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep))
    throw new Error("文件路径超出产出物目录");
  return target;
}
export async function shutdownServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
