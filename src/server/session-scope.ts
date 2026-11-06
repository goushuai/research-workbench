export interface SessionScope {
  account: string;
  directory: string;
}
export function checkSessionScope(saved: SessionScope, current: SessionScope) {
  if (saved.account !== current.account)
    throw new Error(
      "原会话的 ChatGPT 账号与当前账号不一致，请复用配置新建研究",
    );
  if (saved.directory !== current.directory)
    throw new Error("续写需要使用原会话的工作目录");
}
