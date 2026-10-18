"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckSquare,
  Database,
  ExternalLink,
  GitBranch,
  Github,
  GitPullRequest,
  Hash,
  Layers,
  Network,
  Sparkles,
} from "lucide-react";
import { z } from "zod";
import { api, entityName } from "@/lib/api";
import { MarkdownAnswer } from "@/components/assistant/MarkdownAnswer";
import { focusCitationSource, RagSourceList } from "@/components/assistant/RagSourceList";
import { isProductGraphEntity } from "@/lib/graph/mode";
import type {
  AssistantResponse,
  Entity,
  OrganizationRagResponse,
  RagQueryResponse,
  PlatformType,
} from "@/lib/types";

const types = [
  "Company",
  "Employee",
  "Department",
  "Team",
  "Project",
  "Repository",
  "Service",
  "Document",
  "Decision",
  "Incident",
  "Task",
  "PullRequest",
  "Channel",
  "Message",
  "Product",
  "ProductModule",
  "Feature",
  "FeatureRequest",
  "Ticket",
  "Bug",
  "Release",
  "Commit",
  "Comment",
  "Activity",
  "Review",
] as const;

const schema = z.object({
  answer: z.object({
    type: z.enum([
      "company_overview",
      "entity_lookup",
      "ownership_lookup",
      "decision_investigation",
      "impact_analysis",
      "knowledge_graph_query",
      "general_explanation",
    ]),
    title: z.string(),
    summary: z.string(),
    findings: z.array(
      z.object({
        text: z.string(),
        confidence: z.enum(["confirmed", "inferred", "unknown"]),
        citationIds: z.array(z.string()),
      })
    ),
    citations: z.array(
      z.object({
        entityId: z.string(),
        entityType: z.enum(types),
        title: z.string(),
        platform: z
          .enum(["jira", "confluence", "slack", "github", "route", "database"])
          .optional(),
        sourceSystem: z.string().optional(),
        sourceRecordId: z.string().optional(),
        sourceUrl: z.string().url().optional(),
        excerpt: z.string().optional(),
      })
    ),
    related_entities: z.array(
      z
        .object({
          id: z.string(),
          entityType: z.enum(types),
          name: z.string().optional(),
          title: z.string().optional(),
        })
        .passthrough()
    ),
    suggested_actions: z.array(
      z.object({
        label: z.string(),
        type: z.enum(["open_entity", "show_dependencies", "investigate"]),
        entityId: z.string(),
      })
    ),
    uncertainty: z.string(),
  }),
  ui: z.object({
    component: z.enum([
      "company_overview",
      "entity_detail",
      "ownership_panel",
      "decision_timeline",
      "impact_analysis",
      "knowledge_graph",
      "general_response",
    ]),
    layout: z.enum(["compact", "split"]),
    interactions: z.array(
      z.object({
        type: z.enum(["open_entity", "show_dependencies", "investigate"]),
        entityId: z.string(),
      })
    ),
    graph: z.object({
      nodes: z.array(
        z
          .object({
            id: z.string(),
            entityType: z.enum(types).optional(),
            name: z.string().optional(),
            title: z.string().optional(),
          })
          .passthrough()
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          type: z.string(),
          direction: z.enum(["incoming", "outgoing"]).optional(),
        })
      ),
    }),
  }),
  execution: z.object({
    status: z.enum(["completed", "partial", "failed"]),
    stages: z.array(
      z.object({
        name: z.string(),
        status: z.enum(["completed", "fallback", "skipped", "failed"]),
      })
    ),
    errors: z.array(z.string()),
  }),
});

const fallbackSchema = z
  .object({
    answer: z
      .object({
        title: z.string().optional(),
        summary: z.string().optional(),
        uncertainty: z.string().optional(),
        citations: z
          .array(
            z
              .object({
                entityId: z.string(),
                entityType: z.enum(types),
                title: z.string(),
                platform: z
                  .enum([
                    "jira",
                    "confluence",
                    "slack",
                    "github",
                    "route",
                    "database",
                  ])
                  .optional(),
                sourceUrl: z.string().url().optional(),
                excerpt: z.string().optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

function path(type: string, id: string, graphDomain?: unknown) {
  if (type === "Employee") return `/people/${encodeURIComponent(id)}`;
  if (type === "Department") return `/departments/${encodeURIComponent(id)}`;
  if (type === "Project") return `/projects/${encodeURIComponent(id)}`;
  const product = isProductGraphEntity(type, graphDomain);
  return `/org-graph?${product ? "mode=product&" : ""}focus=${encodeURIComponent(
    id
  )}&type=${encodeURIComponent(type)}`;
}

function EntityLink({ entity, type }: { entity: Entity; type: string }) {
  return (
    <Link
      className="agent-entity-link"
      href={path(type, entity.id, entity.graphDomain)}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("oig-graph-selection", {
            detail: { entity: { ...entity, entityType: type }, entityType: type },
          })
        );
        window.dispatchEvent(
          new CustomEvent("oig-graph-focus", {
            detail: {
              id: entity.id,
              type,
              mode: isProductGraphEntity(type, entity.graphDomain) ? "product" : "team",
            },
          })
        );
      }}
    >
      <span>{type}</span>
      <b>{entityName(entity)}</b>
      <ArrowUpRight size={11} />
    </Link>
  );
}

/**
 * Detects or resolves the backing platform for a given source / citation / chunk.
 */
export function resolvePlatform(source: {
  platform?: PlatformType;
  sourcePath?: string;
  sourceSystem?: string;
  title?: string;
  entityType?: string;
}): PlatformType {
  if (
    source.platform &&
    ["jira", "confluence", "slack", "github", "route", "database"].includes(
      source.platform
    )
  ) {
    return source.platform;
  }
  const text = `${source.sourceSystem ?? ""} ${source.sourcePath ?? ""} ${
    source.title ?? ""
  } ${source.entityType ?? ""}`.toLowerCase();

  if (
    text.includes("jira") ||
    text.includes("ticket") ||
    text.includes("issue") ||
    text.includes("bug") ||
    text.includes("pay-") ||
    text.includes("auth-") ||
    text.includes("core-")
  ) {
    return "jira";
  }
  if (
    text.includes("confluence") ||
    text.includes("wiki") ||
    text.includes("doc") ||
    text.includes(".md") ||
    text.includes("specification")
  ) {
    return "confluence";
  }
  if (
    text.includes("slack") ||
    text.includes("channel") ||
    text.includes("message") ||
    text.includes("#")
  ) {
    return "slack";
  }
  if (
    text.includes("github") ||
    text.includes("repo") ||
    text.includes("pullrequest") ||
    text.includes("pr ") ||
    text.includes("pr #") ||
    text.includes("commit") ||
    text.includes("branch")
  ) {
    return "github";
  }
  if (text.includes("/api/") || text.includes("route") || text.includes("endpoint")) {
    return "route";
  }
  return "database";
}

/**
 * Platform badge with branded icon and label.
 */
export function PlatformBadge({ platform }: { platform: PlatformType }) {
  switch (platform) {
    case "jira":
      return (
        <span className="platform-badge jira">
          <CheckSquare size={11} />
          Jira
        </span>
      );
    case "confluence":
      return (
        <span className="platform-badge confluence">
          <BookOpen size={11} />
          Confluence
        </span>
      );
    case "slack":
      return (
        <span className="platform-badge slack">
          <Hash size={11} />
          Slack
        </span>
      );
    case "github":
      return (
        <span className="platform-badge github">
          <Github size={11} />
          GitHub
        </span>
      );
    case "route":
      return (
        <span className="platform-badge route">
          <Network size={11} />
          API Route
        </span>
      );
    case "database":
    default:
      return (
        <span className="platform-badge database">
          <Database size={11} />
          Company Graph
        </span>
      );
  }
}

/**
 * Dedicated platform card displaying evidence backing the information from Jira, Confluence, Slack, GitHub, or API Route.
 */
export function PlatformEvidenceCard({
  title,
  platform,
  sourcePath,
  excerpt,
  sourceUrl,
  entityId,
  entityType,
}: {
  title: string;
  platform: PlatformType;
  sourcePath?: string;
  excerpt?: string;
  sourceUrl?: string;
  entityId?: string;
  entityType?: string;
}) {
  return (
    <div className={`platform-card ${platform}`}>
      <div className="platform-card-header">
        <PlatformBadge platform={platform} />
      </div>

      <div className="platform-card-title-row">
        <h5 className="platform-card-title">{title}</h5>
        {sourcePath && sourcePath !== title && (
          <span className="platform-card-path">{sourcePath}</span>
        )}
      </div>

      {excerpt && <p className="platform-card-excerpt">{excerpt}</p>}

      <div className="platform-card-footer">
        {entityId && entityType && (
          <EntityLink
            entity={{ id: entityId, title } as Entity}
            type={entityType}
          />
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="platform-card-link"
          >
            Open in {platform} <ExternalLink size={11} />
          </a>
        )}
        {!sourceUrl && sourcePath && sourcePath.startsWith("/") && (
          <span className="platform-card-endpoint">
            Endpoint: <code>{sourcePath}</code>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Formatted Text Answer renderer with markdown paragraph & list support.
 */
function FormattedTextAnswer({ text }: { text: string }) {
  if (!text) return <p className="agent-muted">No text answer available.</p>;

  // Split into paragraphs / bullet lines
  const lines = text.split("\n");
  const blocks: Array<{ type: "p" | "li" | "h"; content: string }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      blocks.push({ type: "li", content: line.slice(2).trim() });
    } else if (line.startsWith("### ") || line.startsWith("## ")) {
      blocks.push({
        type: "h",
        content: line.replace(/^#+\s*/, "").trim(),
      });
    } else {
      blocks.push({ type: "p", content: line });
    }
  }

  return (
    <div className="rag-text-answer">
      {blocks.map((block, idx) => {
        if (block.type === "li") {
          return (
            <div key={idx} className="rag-text-bullet">
              <span className="rag-bullet-dot">•</span>
              <span>{block.content}</span>
            </div>
          );
        }
        if (block.type === "h") {
          return (
            <h4 key={idx} className="rag-text-heading">
              {block.content}
            </h4>
          );
        }
        return (
          <p key={idx} className="rag-text-paragraph">
            {block.content}
          </p>
        );
      })}
    </div>
  );
}

function isRagResponse(payload: unknown): payload is OrganizationRagResponse | RagQueryResponse {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.agent === "organization-intelligence" ||
    (typeof p.answer === "string" &&
      (Array.isArray(p.retrieved_chunks) || Array.isArray(p.sources)))
  );
}

function safeExternalSourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch { return undefined; }
}

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="rag-copy-answer" aria-label="Copy answer" onClick={() => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }).catch(() => setCopied(false));
  }}>{copied ? "Copied" : "Copy answer"}</button>;
}

export function AgentResponseRenderer({
  payload,
  onAction,
  messageId = "response",
}: {
  payload: unknown;
  messageId?: string;
  onAction?: (
    type: "open_entity" | "show_dependencies" | "investigate",
    entityId: string
  ) => void;
}) {
  const [neighborhood, setNeighborhood] = useState<
    AssistantResponse["ui"]["graph"] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<
    PlatformType | "all"
  >("all");

  // Case 1: Organization Intelligence Agent 1 RAG Response
  if (isRagResponse(payload)) {
    const rag = payload;
    const retrievedChunks = "retrieved_chunks" in rag ? rag.retrieved_chunks ?? [] : [];
    const sources = rag.sources ?? [];
    const hasEvidence = "evidenceFound" in rag ? rag.evidenceFound : retrievedChunks.length > 0;
    return (
      <article className="rag-answer">
        <div className="rag-answer-actions">
          <span className="rag-answer-label"><Sparkles size={13} aria-hidden="true" /> Nora · OrgMind</span>
          <CopyAnswerButton text={rag.answer} />
        </div>
        <div className="rag-typed-answer"><MarkdownAnswer text={rag.answer} citationCount={sources.reduce((max, source, index) => Math.max(max, ...("citationIds" in source && source.citationIds?.length ? source.citationIds.map((id) => Number(id.slice(1))) : [index + 1])), 0)} onCitationClick={(number) => focusCitationSource(messageId, number)} /></div>
        {!hasEvidence && (
          <p className="agent-uncertainty" role="status">No relevant evidence was found in the indexed company sources.</p>
        )}
        {sources.length === 0 && hasEvidence && (
          <p className="agent-muted" role="status">Evidence was retrieved, but no source citations were returned for this answer.</p>
        )}
        <RagSourceList sources={sources} messageId={messageId} />
      </article>
    );
  }

  // Case 2: Agent 2 Structured LangGraph Assistant Response
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const fallback = fallbackSchema.safeParse(payload);
    if (!fallback.success) {
      return (
        <article className="agent-response-card">
          <p className="agent-muted">
            Unsupported structured response. The response payload did not pass
            validation.
          </p>
        </article>
      );
    }
    const answer = fallback.data.answer;
    return (
      <article className="agent-response-card">
        <div className="rag-answer-actions"><span className="rag-answer-label"><Sparkles size={13} aria-hidden="true" /> OrgMind</span><CopyAnswerButton text={[answer.title, answer.summary, ...(answer.citations ?? []).map((citation) => citation.title)].filter(Boolean).join("\n\n")} /></div>
        <div className="agent-entity-summary">
          <small>General response</small>
          <h3>{answer.title ?? "Workspace answer"}</h3>
          <p>{answer.summary ?? "No summary was provided."}</p>
        </div>
        {answer.citations?.map((c) => {
          const platform = resolvePlatform({
            platform: c.platform,
            sourcePath: c.sourceUrl,
            title: c.title,
            entityType: c.entityType,
          });
          return (
            <PlatformEvidenceCard
              key={c.entityId}
              title={c.title}
              platform={platform}
              excerpt={c.excerpt}
              sourceUrl={c.sourceUrl}
              entityId={c.entityId}
              entityType={c.entityType}
            />
          );
        })}
        {answer.uncertainty && (
          <p className="agent-uncertainty">{answer.uncertainty}</p>
        )}
      </article>
    );
  }

  const response = parsed.data;
  const answer = response.answer;
  const nodes = neighborhood?.nodes ?? response.ui.graph.nodes;
  const edges = neighborhood?.edges ?? response.ui.graph.edges;

  async function act(
    type: "open_entity" | "show_dependencies" | "investigate",
    id: string
  ) {
    if (type === "show_dependencies") {
      const entity =
        answer.related_entities.find((item) => item.id === id) ??
        answer.citations.find((item) => item.entityId === id);
      const found = entity ?? response.ui.graph.nodes.find((item) => item.id === id);
      if (found?.entityType) {
        setBusy(true);
        try {
          setNeighborhood(await api.neighborhood(found.entityType, id));
        } catch {
          onAction?.(type, id);
        } finally {
          setBusy(false);
        }
      }
    } else {
      onAction?.(type, id);
    }
  }

  const temporal = [...nodes].sort(
    (a, b) =>
      Date.parse(
        String(a.occurredAt ?? a.validFrom ?? a.createdAt ?? a.updatedAt ?? "")
      ) -
      Date.parse(
        String(b.occurredAt ?? b.validFrom ?? b.createdAt ?? b.updatedAt ?? "")
      )
  );

  return (
    <article className="agent-response-card">
      <div className="rag-answer-actions"><span className="rag-answer-label"><Sparkles size={13} aria-hidden="true" /> OrgMind</span><CopyAnswerButton text={[answer.title, answer.summary, ...answer.findings.map((item) => item.text)].filter(Boolean).join("\n\n")} /></div>
      <div className="agent-entity-summary">
        <small>{answer.type.replaceAll("_", " ")}</small>
        <h3>{answer.title}</h3>
        <p>{answer.summary}</p>
      </div>

      {answer.findings.length > 0 && (
        <section className="agent-response-section">
          <h4>Findings</h4>
          {answer.findings.map((item, i) => (
            <div className="agent-edge-row" key={`${i}:${item.text}`}>
              <b>{item.confidence}</b> · {item.text}
            </div>
          ))}
        </section>
      )}

      {answer.type === "decision_investigation" && (
        <section className="agent-response-section">
          <h4>Connected record timeline</h4>
          {temporal.length ? (
            <ol className="agent-timeline">
              {temporal.map((item) => (
                <li key={item.id}>
                  <span>
                    {String(
                      item.occurredAt ??
                        item.validFrom ??
                        item.createdAt ??
                        item.updatedAt ??
                        "Date not recorded"
                    )}
                  </span>
                  <EntityLink entity={item} type={item.entityType ?? "Document"} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="agent-muted">No dated connected records returned.</p>
          )}
        </section>
      )}

      {answer.type === "impact_analysis" && (
        <section className="agent-response-section">
          <h4>
            <Network size={12} /> Recorded dependencies
          </h4>
          <p className="agent-muted">
            Graph traversal only; no simulation was run.
          </p>
          {nodes.map((item) => (
            <EntityLink
              key={item.id}
              entity={item}
              type={item.entityType ?? "Unknown"}
            />
          ))}
        </section>
      )}

      {answer.type === "ownership_lookup" && (
        <section className="agent-response-section">
          <h4>People and groups</h4>
          {answer.related_entities
            .filter((item) =>
              ["Employee", "Team", "Department"].includes(item.entityType)
            )
            .map((item) => (
              <EntityLink
                key={item.id}
                entity={item}
                type={item.entityType}
              />
            ))}
        </section>
      )}

      {answer.related_entities.length > 0 &&
        answer.type !== "ownership_lookup" && (
          <section className="agent-response-section">
            <h4>
              <GitBranch size={12} /> Related entities
            </h4>
            <div className="agent-card-list">
              {answer.related_entities.slice(0, 8).map((item) => (
                <EntityLink
                  key={item.id}
                  entity={item}
                  type={item.entityType}
                />
              ))}
            </div>
          </section>
        )}

      {edges.length > 0 && (
        <section className="agent-response-section">
          <h4>Graph relationships</h4>
          {edges.slice(0, 12).map((edge, i) => (
            <div className="agent-edge-row" key={`${edge.from}:${edge.to}:${i}`}>
              {edge.type} · {edge.from} → {edge.to}
            </div>
          ))}
        </section>
      )}

      {neighborhood && answer.type !== "impact_analysis" && (
        <section className="agent-response-section">
          <h4>Loaded neighborhood</h4>
          {nodes.map((item) => (
            <EntityLink
              key={item.id}
              entity={item}
              type={item.entityType ?? "Unknown"}
            />
          ))}
        </section>
      )}

      {/* Citations displayed with rich Platform Cards */}
      {answer.citations.length > 0 && (
        <section className="agent-response-section">
          <h4>Evidence and sources ({answer.citations.length})</h4>
          <div className="platform-cards-grid">
            {answer.citations.slice(0, 8).map((c) => {
              const platform = resolvePlatform({
                platform: c.platform,
                sourcePath: c.sourceRecordId || c.sourceUrl,
                sourceSystem: c.sourceSystem,
                title: c.title,
                entityType: c.entityType,
              });
              return (
                <PlatformEvidenceCard
                  key={c.entityId}
                  title={c.title}
                  platform={platform}
                  sourcePath={c.sourceRecordId}
                  excerpt={c.excerpt}
                  sourceUrl={c.sourceUrl}
                  entityId={c.entityId}
                  entityType={c.entityType}
                />
              );
            })}
          </div>
        </section>
      )}

      {answer.suggested_actions.length > 0 && (
        <section className="agent-response-section">
          <h4>Next actions</h4>
          {answer.suggested_actions.map((item, i) => (
            <button
              className="small-button"
              type="button"
              key={`${i}:${item.entityId}`}
              disabled={busy}
              onClick={() => void act(item.type, item.entityId)}
            >
              {busy ? "Loading…" : item.label}
            </button>
          ))}
        </section>
      )}

      {answer.uncertainty && (
        <p className="agent-uncertainty">{answer.uncertainty}</p>
      )}

      {response.execution.stages.length > 0 && (
        <details className="agent-execution">
          <summary>Agent activity · {response.execution.status}</summary>
          <p>
            {response.execution.stages
              .map((s) => `${s.name}: ${s.status}`)
              .join(" · ")}
          </p>
          {response.execution.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
    </article>
  );
}
