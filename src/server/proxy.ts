import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { copilotExe, proxyExe, proxyRoot, dataRoot } from "./paths.js";
import type { AccountStatus, ModelInfo } from "../shared/types.js";
import { normalizeModels } from "./models.js";

let starting: Promise<void> | undefined;
let login: ChildProcess | undefined;
let loginState: AccountStatus["loginStatus"] = "idle";
let loginUrl: string | undefined;
let loginError: string | undefined;
export function proxyConnection() {
  const config = parse(readFileSync(join(proxyRoot, "config.yaml"), "utf8"));
  const key = config.access?.["api-keys"]?.[0] ?? config["api-keys"]?.[0];
  if (typeof key !== "string" || !key)
    throw new Error("订阅转接配置缺失，请先配置 CLIProxyAPI");
  const port = config.server?.port ?? config.port ?? 8317;
  return { baseUrl: `http://127.0.0.1:${port}`, key };
}
export async function proxyFetch(path: string, init: RequestInit = {}) {
  const connection = proxyConnection();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${connection.key}`);
  return fetch(connection.baseUrl + path, { ...init, headers });
}
async function isReady() {
  try {
    const response = await proxyFetch("/v1/models", {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
export async function ensureProxy(): Promise<void> {
  if (await isReady()) return;
  if (starting) return starting;
  starting = (async () => {
    if (!existsSync(proxyExe))
      throw new Error("找不到 CLIProxyAPI，请检查执行路径");
    const child = spawn(
      proxyExe,
      ["--config", join(proxyRoot, "config.yaml"), "--local-model"],
      { cwd: proxyRoot, windowsHide: true, detached: true, stdio: "ignore" },
    );
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    child.unref();
    if (child.pid)
      writeFileSync(join(dataRoot, "proxy.pid"), String(child.pid));
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnError) throw new Error(`启动订阅转接失败 ${spawnError.message}`);
      if (await isReady()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("订阅转接启动超时，请检查 8317 端口与网络代理");
  })().finally(() => {
    starting = undefined;
  });
  return starting;
}
export async function listModels(): Promise<ModelInfo[]> {
  await ensureProxy();
  const response = await proxyFetch("/v1/models", {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("模型目录读取失败，请检查登录状态");
  const result = (await response.json()) as { data?: unknown[] };
  return normalizeModels(result.data ?? []);
}
function credentials() {
  const directory = join(proxyRoot, "auth");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
        return value.type === "codex" && value.access_token ? [value] : [];
      } catch {
        return [];
      }
    });
}
export function accountFingerprint() {
  const saved = credentials()[0];
  const identity = saved?.account_id || saved?.email;
  if (!identity) throw new Error("请先连接 ChatGPT 账号");
  return createHash("sha256").update(String(identity)).digest("hex");
}
export async function accountStatus(): Promise<AccountStatus> {
  const saved = credentials()[0];
  const email = typeof saved?.email === "string" ? saved.email : "";
  return {
    signedIn: !!saved,
    plan: saved?.plan_type ?? null,
    account: email ? email.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null,
    proxyReady: await isReady(),
    copilotInstalled: existsSync(copilotExe),
    loginStatus: loginState,
    loginUrl,
    error: loginError,
  };
}
export async function beginLogin() {
  if (login && login.exitCode === null) return accountStatus();
  loginState = "waiting";
  loginUrl = undefined;
  loginError = undefined;
  login = spawn(
    proxyExe,
    [
      "--config",
      join(proxyRoot, "config.yaml"),
      "--codex-login",
      "--no-browser",
    ],
    { cwd: proxyRoot, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  const child = login;
  let transcript = "";
  const consume = (data: Buffer) => {
    transcript += data.toString();
    const match = transcript.match(/https:\/\/auth\.openai\.com\/[^\s\x1b]+/);
    if (match) loginUrl = match[0];
    if (/authentication successful/i.test(transcript)) loginState = "success";
    if (/Paste the Codex callback URL/.test(data.toString()))
      child.stdin?.write("\n");
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  child.on("error", (error) => {
    loginState = "error";
    loginError = error.message;
  });
  child.on("close", () => {
    if (loginState !== "success") {
      loginState = "error";
      loginError = "授权未完成或令牌交换失败，请检查网络代理后重试";
    }
    loginUrl = undefined;
  });
  return accountStatus();
}
