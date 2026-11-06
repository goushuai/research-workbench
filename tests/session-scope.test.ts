import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSessionScope } from "../src/server/session-scope.js";
test("session resumes only under the same account and working directory", () => {
  const scope = { account: "hash-a", directory: "C:/project" };
  assert.doesNotThrow(() => checkSessionScope(scope, scope));
  assert.throws(
    () => checkSessionScope(scope, { ...scope, account: "hash-b" }),
    /账号/,
  );
  assert.throws(
    () => checkSessionScope(scope, { ...scope, directory: "C:/other" }),
    /目录/,
  );
});
