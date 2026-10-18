import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, friendlyApiError } from "./api.js";
import { createSubmissionLock } from "./submission-lock.js";

const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("RAG query posts the backend contract to the configured local API", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return response({
      answer: "The company provides platform engineering support. [S1]",
      sources: [{ documentId: "docs/company.md", chunkId: "documentation:docs%2Fcompany.md:0", citationIds: ["S1"], sourceType: "confluence", title: "Company Overview", url: "https://example.test/company", excerpt: "Company evidence excerpt.", score: 0.87 }],
      retrieval: { candidateCount: 8, usedChunks: 2 },
      evidenceFound: true,
    });
  };
  try {
    const result = await api.ragQuery("What does the company do?");
    assert.equal(requestUrl, "http://localhost:8080/api/rag/query");
    assert.equal(requestInit?.method, "POST");
    assert.equal(new Headers(requestInit?.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { question: "What does the company do?" });
  assert.equal(new Headers(requestInit?.headers).get("x-orgmind-user-id"), "demo@hirenova.com");
    assert.equal(result.sources[0]?.documentId, "docs/company.md");
    assert.equal(result.sources[0]?.score, 0.87);
    assert.deepEqual(result.sources[0]?.citationIds, ["S1"]);
    assert.equal(result.sources[0]?.excerpt, "Company evidence excerpt.");
  } finally { globalThis.fetch = originalFetch; }
});

test("backend health is read from the configured API health endpoint", async () => {
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return response({ status: "ok", database: "connected" });
  };
  try {
    assert.deepEqual(await api.health(), { status: "ok", database: "connected" });
    assert.equal(requestUrl, "http://localhost:8080/health");
  } finally { globalThis.fetch = originalFetch; }
});

test("RAG query accepts empty citations and missing optional citation fields", async () => {
  globalThis.fetch = async () => response({ answer: "No relevant evidence was found.", sources: [], retrieval: { candidateCount: 0, usedChunks: 0 }, evidenceFound: false });
  try {
    const result = await api.ragQuery("Ask about an unindexed policy");
    assert.deepEqual(result.sources, []);
    assert.equal(result.evidenceFound, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("RAG query rejects empty and malformed success payloads", async () => {
  globalThis.fetch = async () => response({ answer: "  ", sources: [], evidenceFound: false });
  try { await assert.rejects(api.ragQuery("Question"), /empty answer/i); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => response({ answer: 42, sources: "not an array" });
  try { await assert.rejects(api.ragQuery("Question"), /invalid response/i); }
  finally { globalThis.fetch = originalFetch; }
});

test("RAG query maps backend HTTP errors to useful messages", async () => {
  globalThis.fetch = async () => response({ error: "The company knowledge service is unavailable." }, 503);
  try {
    await assert.rejects(api.ragQuery("Question"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 503);
      assert.match(friendlyApiError(error), /company knowledge service is unavailable/i);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});

test("RAG query reports an unavailable backend and request timeouts clearly", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  try { await assert.rejects(api.ragQuery("Question"), /Could not reach the company data service/i); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  try { await assert.rejects(api.ragQuery("Question"), /request timed out/i); }
  finally { globalThis.fetch = originalFetch; }
});

test("submission lock ignores repeated sends until the first request settles", async () => {
  const lock = createSubmissionLock();
  const releaseFirst = lock.acquire();
  assert.ok(releaseFirst);
  assert.equal(lock.acquire(), undefined);
  releaseFirst();
  assert.ok(lock.acquire());
});
