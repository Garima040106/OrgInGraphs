import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentResponseRenderer } from "./AgentResponseRenderer.js";
import { MarkdownAnswer } from "./MarkdownAnswer.js";
import { SourceIcon } from "./SourceIcon.js";

test("RAG response renders compact source metadata, citation mappings, and empty evidence state", () => {
  const withSource = renderToStaticMarkup(<AgentResponseRenderer payload={{
    answer: "The company supports **platform engineering**. [S1] [S2]",
    sources: [{ documentId: "docs/company.md", chunkId: "chunk-1", sourceType: "confluence", title: "Company Overview", url: "https://example.test/company", score: 0.87, excerpt: "The company builds connected tools.", citationIds: ["S1", "S2"] }],
    retrieval: { candidateCount: 4, usedChunks: 2 },
    evidenceFound: true,
  }} messageId="answer-1" />);
  assert.match(withSource, /Company Overview/);
  assert.match(withSource, /The company builds connected tools\./);
  assert.match(withSource, /confluence/);
  assert.match(withSource, /0\.87/);
  assert.match(withSource, /href="https:\/\/example\.test\/company"/);
  assert.match(withSource, /<strong>platform engineering<\/strong>/);
  assert.match(withSource, /data-citation-ids="S1 S2"/);
  assert.match(withSource, /Developer details/);
  assert.match(withSource, /\[S1\]/);
  assert.match(withSource, /\[S2\]/);
  assert.match(withSource, /src="\/img\/confluence\.png"/);

  const unsafeUrl = renderToStaticMarkup(<AgentResponseRenderer payload={{
    answer: "A reference without an external link. [S1]",
    sources: [{ documentId: "internal/path", chunkId: "private-chunk", sourceType: "mystery", title: "Internal reference", url: "javascript:alert(1)", score: 0.2 }],
    retrieval: { candidateCount: 1, usedChunks: 1 }, evidenceFound: true,
  }} messageId="answer-2" />);
  assert.doesNotMatch(unsafeUrl, /href="javascript:/);
  assert.match(unsafeUrl, /aria-label="mystery source"/);
  assert.match(unsafeUrl, /Developer details/);

  const evidenceWithoutCitations = renderToStaticMarkup(<AgentResponseRenderer payload={{
    answer: "Evidence-backed answer without citations.", sources: [], retrieved_chunks: [{ chunkId: "chunk-a", sourcePath: "docs/guide.md", score: 0.8, text: "Evidence", metadata: { title: "Guide" } }], agent: "organization-intelligence", status: "completed",
  }} />);
  assert.match(evidenceWithoutCitations, /no source citations were returned/i);

  const withoutSource = renderToStaticMarkup(<AgentResponseRenderer payload={{
    answer: "No indexed answer is available.", sources: [], retrieval: { candidateCount: 0, usedChunks: 0 }, evidenceFound: false,
  }} />);
  assert.match(withoutSource, /No relevant evidence was found/);
  assert.doesNotMatch(withoutSource, /rag-source-card/);
});

test("Markdown answers render code, lists, inline formatting, and links as safe React text", () => {
  const html = renderToStaticMarkup(<MarkdownAnswer text={[
    "## Summary",
    "Use **bold**, *emphasis*, and `inline code`.",
    "- first item",
    "- second item",
    "```ts",
    "const answer = '<script>alert(1)</script>';",
    "```",
    "[unsafe](javascript:alert(1))",
  ].join("\n")} />);
  assert.match(html, /<h2/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<code class="rag-inline-code">inline code<\/code>/);
  assert.match(html, /<ul class="rag-markdown-list">/);
  assert.match(html, /<pre class="rag-code-block"><code class="language-ts">/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("Markdown tables render and only returned citation IDs are interactive", () => {
  const html = renderToStaticMarkup(<MarkdownAnswer text={[
    "| Project | Status |",
    "| --- | :---: |",
    "| Checkout | active [S1] |",
    "| Billing | planned |",
    "",
    "[S2]",
  ].join("\n")} citationCount={1} onCitationClick={() => undefined} />);
  assert.match(html, /<table class="rag-markdown-table">/);
  assert.match(html, /<th>Project<\/th>/);
  assert.match(html, /<td>Checkout<\/td>/);
  assert.match(html, /aria-label="Show source 1"/);
  assert.match(html, /<span class="rag-inline-citation">\[S2\]<\/span>/);
});

test("source icons use the existing local provider logos", () => {
  const assets = { confluence: "/img/confluence.png", jira: "/img/jira.webp", slack: "/img/slack.png", github: "/img/github.png" };
  for (const [sourceType, src] of Object.entries(assets)) {
    const html = renderToStaticMarkup(<SourceIcon sourceType={sourceType} />);
    assert.match(html, new RegExp(`src="${src.replaceAll(".", "\\.")}"`));
  }
});
