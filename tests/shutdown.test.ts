import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { shutdownServer } from "../src/server/lifecycle.js";
test("server shutdown completes with an open event stream", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: ready\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as any;
  const response = await fetch(`http://127.0.0.1:${address.port}`);
  try {
    await shutdownServer(server);
    assert.equal(server.listening, false);
  } finally {
    await response.body?.cancel();
    server.closeAllConnections();
    server.close();
  }
});
