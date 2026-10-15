import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Graph } from "falkordb";
import { createApp } from "../src/api/app.js";

test("CORS allows the local frontend origins and answers preflight requests", async () => {
  const server = createApp({} as Graph).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/company`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET,OPTIONS");

    const rejectedOrigin = await fetch(`http://127.0.0.1:${address.port}/api/company`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(rejectedOrigin.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
