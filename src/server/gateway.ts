import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { ResearchConfig } from "../shared/types.js";
import { constrainRequest } from "./models.js";
import { proxyFetch } from "./proxy.js";

export async function createRunGateway(
  config: ResearchConfig,
  observe: (type: string, data: Record<string, unknown>) => void,
): Promise<{ server: Server; url: string; key: string }> {
  const key = randomBytes(32).toString("hex");
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${key}`) {
      response.writeHead(401).end();
      return;
    }
    const path = (request.url ?? "").split("?")[0];
    if (
      !["/v1/responses", "/v1/chat/completions", "/v1/models"].includes(path)
    ) {
      response.writeHead(404).end();
      return;
    }
    const controller = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    try {
      let body: string | undefined;
      if (request.method === "POST") {
        let size = 0;
        const buffers: Buffer[] = [];
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) throw new Error("模型请求超过 20 MB");
          buffers.push(chunk);
        }
        const original = JSON.parse(Buffer.concat(buffers).toString());
        observe("model.request", {
          requestedModel: original.model,
          appliedModel: config.model,
          reasoningEffort: config.reasoningEffort,
          tools: original.tools
            ?.map((tool: any) => tool.name ?? tool.function?.name)
            .filter(Boolean),
        });
        body = JSON.stringify(constrainRequest(original, config));
      }
      const upstream = await proxyFetch(path, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      response.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-cache",
      });
      if (!upstream.body) {
        response.end();
        return;
      }
      let pending = "";
      const decoder = new TextDecoder();
      for await (const chunk of upstream.body) {
        response.write(chunk);
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines)
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "response.completed")
                observe("model.completed", {
                  model: event.response?.model,
                  usage: event.response?.usage,
                });
              if (event.type === "response.failed")
                observe("model.failed", { code: event.response?.error?.code });
            } catch {
              /* Non-JSON SSE frames carry no model metadata. */
            }
          }
        if (pending.length > 1024 * 1024) pending = "";
      }
      response.end();
    } catch (error) {
      if (!response.headersSent)
        response.writeHead(502, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : "模型连接失败",
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("研究模型入口启动失败");
  return { server, url: `http://127.0.0.1:${address.port}/v1`, key };
}
