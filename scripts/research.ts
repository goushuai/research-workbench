import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { normalizeResearchConfig } from "../src/shared/config.js";
const input = parse(readFileSync(process.argv[2] || "task.yaml", "utf8"));
const url = `http://127.0.0.1:${process.env.PORT || 8765}`;
const response = await fetch(url + "/api/state");
const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
const state = (await response.json()) as any;
const result = await fetch(url + "/api/tasks", {
  method: "POST",
  headers: {
    Cookie: cookie,
    "X-Workbench-Request": "1",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: input.title || input.goal,
    description: input.goal,
    tags: [],
    config: normalizeResearchConfig(input.config ?? input, state.settings),
    requestId: crypto.randomUUID(),
  }),
});
if (!result.ok) throw new Error(await result.text());
const { task } = (await result.json()) as any;
console.log(`已排队 ${task.title} ${task.id}`);
