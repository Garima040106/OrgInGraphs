"use client";

import { ExternalLink } from "lucide-react";
import React from "react";
import { SourceIcon } from "@/components/assistant/SourceIcon";
import type { RagQueryResponse, OrganizationRagResponse } from "@/lib/types";

type Source = RagQueryResponse["sources"][number] | OrganizationRagResponse["sources"][number];

function safeExternalSourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch { return undefined; }
}

function sourcePath(source: Source) {
  return "documentId" in source ? source.documentId : source.sourcePath;
}

function citationIds(source: Source, index: number) {
  return "citationIds" in source && source.citationIds?.length ? source.citationIds : [`S${index + 1}`];
}

export function RagSourceList({ sources, messageId }: { sources: Source[]; messageId: string }) {
  if (!sources.length) return null;
  return <section className="rag-sources" aria-label="Answer sources">
    <h4>Sources <span>{sources.length}</span></h4>
    <div className="rag-source-list">
      {sources.map((source, index) => {
        const path = sourcePath(source);
        const ids = citationIds(source, index);
        const provider = "platform" in source ? source.platform : source.sourceType;
        const url = safeExternalSourceUrl(source.url);
        const excerpt = "excerpt" in source ? source.excerpt : undefined;
        const chunkId = "chunkId" in source ? source.chunkId : undefined;
        const citations = ids.map((id) => `[${id}]`).join(" ");
        const id = `rag-source-${messageId}-${index + 1}`;
        return <details className="rag-source-card" id={id} data-citation-ids={ids.join(" ")} key={`${path}:${index}`}>
          <summary>
            <SourceIcon sourceType={provider} />
            <span className="rag-source-copy">
              <span className="rag-source-title">{source.title || "Untitled source"}</span>
              <span className="rag-source-meta">{provider || "Company source"} · {citations}</span>
            </span>
            <span className="rag-source-expand">Details</span>
          </summary>
          <div className="rag-source-detail">
            {excerpt && <p>{excerpt}</p>}
            {url && <a className="rag-source-link" href={url} target="_blank" rel="noopener noreferrer">View source <ExternalLink size={13} aria-hidden="true" /></a>}
            {process.env.NODE_ENV !== "production" && <details className="rag-source-developer">
              <summary>Developer details</summary>
              <code>{path}</code>{chunkId && <code>{chunkId}</code>}
            </details>}
          </div>
        </details>;
      })}
    </div>
  </section>;
}

export function focusCitationSource(messageId: string, citationNumber: number) {
  const citationId = `S${citationNumber}`;
  const source = [...document.querySelectorAll<HTMLElement>(`[id^="rag-source-${CSS.escape(messageId)}-"]`)]
    .find((item) => item.dataset.citationIds?.split(" ").includes(citationId));
  if (!source) return;
  if (source instanceof HTMLDetailsElement) source.open = true;
  source.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  source.querySelector("summary")?.focus({ preventScroll: true });
}
