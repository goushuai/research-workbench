import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CompletionTracker,
  DeliveryGate,
  safeFile,
} from "../src/server/lifecycle.js";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("missing research delivery gets one bounded completion turn", () => {
  const gate = new DeliveryGate();
  assert.equal(gate.needsDelivery(false), true);
  assert.equal(gate.needsDelivery(false), false);
  assert.equal(new DeliveryGate().needsDelivery(true), false);
});
test("child agent turn completion cannot complete the parent research", () => {
  const tracker = new CompletionTracker();
  tracker.accept({
    type: "assistant.turn_end",
    data: { parentToolCallId: "child" },
  });
  assert.equal(tracker.finished, false);
});
test("research waits for outstanding tools after the root turn ends", () => {
  const tracker = new CompletionTracker();
  tracker.accept({
    type: "tool.execution_start",
    data: { toolCallId: "task" },
  });
  tracker.accept({
    type: "assistant.message",
    data: { content: "报告已生成", toolRequests: [] },
  });
  tracker.accept({ type: "assistant.turn_end", data: {} });
  assert.equal(tracker.finished, false);
  tracker.accept({
    type: "tool.execution_complete",
    data: { toolCallId: "task" },
  });
  assert.equal(tracker.finished, true);
});
test("another root turn resets completion and reports explicit failure", () => {
  const tracker = new CompletionTracker();
  tracker.accept({
    type: "assistant.message",
    data: { content: "报告已生成", toolRequests: [] },
  });
  tracker.accept({ type: "assistant.turn_end", data: {} });
  tracker.accept({ type: "assistant.turn_start", data: {} });
  assert.equal(tracker.finished, false);
  tracker.accept({
    type: "session.error",
    data: { message: "network failed" },
  });
  assert.equal(tracker.error, "network failed");
});
test("a tool-only root turn does not end research before the next model round", () => {
  const tracker = new CompletionTracker();
  tracker.accept({
    type: "assistant.message",
    data: { content: "", toolRequests: [{ id: "call" }] },
  });
  tracker.accept({ type: "assistant.turn_end", data: {} });
  assert.equal(tracker.finished, false);
});
test("artifact access rejects traversal and resolves existing paths inside allowed root", () => {
  const root = mkdtempSync(join(tmpdir(), "research-path-"));
  mkdirSync(join(root, "deliverables"));
  writeFileSync(join(root, "deliverables", "报告.md"), "# 报告");
  assert.equal(
    safeFile(root, "deliverables/报告.md"),
    join(root, "deliverables", "报告.md"),
  );
  assert.throws(() => safeFile(root, "../outside.md"), /路径/);
  assert.throws(() => safeFile(root, "C:/outside.md"), /路径/);
});
