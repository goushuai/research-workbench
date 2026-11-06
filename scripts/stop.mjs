const url = `http://127.0.0.1:${process.env.PORT || 8765}`;
const response = await fetch(url + "/api/state");
const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
const result = await fetch(url + "/api/server/stop", {
  method: "POST",
  headers: {
    Cookie: cookie,
    "X-Workbench-Request": "1",
    "Content-Type": "application/json",
  },
  body: "{}",
});
if (!result.ok) throw new Error(await result.text());
console.log("工作台服务已停止，独立研究进程会继续运行。");
