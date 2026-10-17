"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Compass,
  MessageSquarePlus,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { AgentResponseRenderer } from "@/components/assistant/AgentResponseRenderer";
import { api, entityName, friendlyApiError } from "@/lib/api";
import { isProductGraphEntity } from "@/lib/graph/mode";
import type {
  AssistantConversation,
  AssistantResponse,
  AssistantTurn,
  Entity,
  EntityType,
  GraphEntityType,
  OrganizationRagResponse,
} from "@/lib/types";

type Message = {
  role: "assistant" | "user";
  content: string;
  response?: AssistantResponse;
  ragResponse?: OrganizationRagResponse;
};

const ragGreeting: Message = {
  role: "assistant",
  content:
    "Hi, I’m OrgMind Assistant. Ask me about the company, its people, projects, decisions, documents, conversations, or engineering systems. I’ll look for indexed evidence and cite the sources I use.",
};

const graphGreeting: Message = {
  role: "assistant",
  content:
    "Ask about indexed company graph records. I can inspect ownership, decisions, dependencies, and the evidence connected to them.",
};

const ragSuggestions = [
  "What does the company do, and how is it organized?",
  "Summarize our active projects, products, and services.",
  "Who owns each team and area of work?",
  "What are the key decisions and why were they made?",
  "Find company information about a topic…",
];

const graphSuggestions = [
  "Who owns billing?",
  "Why did we change authentication?",
  "What could break if we deprecate Auth v1?",
];

export function CompanyAssistant({
  open,
  onClose,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  selected?: { entity: Entity; entityType: GraphEntityType | "Unknown" } | null;
}) {
  const [mode, setMode] = useState<"intelligence" | "graph">("intelligence");
  const [messages, setMessages] = useState<Message[]>([ragGreeting]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Switch modes cleanly
  function handleModeChange(newMode: "intelligence" | "graph") {
    if (newMode === mode) return;
    setMode(newMode);
    setError("");
    if (messages.length <= 1) {
      setMessages([newMode === "intelligence" ? ragGreeting : graphGreeting]);
    }
  }

  async function selectConversation(id: string) {
    setPending(true);
    setError("");
    try {
      const result = await api.assistantConversation(id);
      setConversationId(id);
      setMessages(
        result.turns.length
          ? result.turns.map((turn: AssistantTurn) => ({
              role: turn.role,
              content: turn.content,
              response: turn.response,
              ragResponse: turn.ragResponse,
            }))
          : [graphGreeting]
      );
    } catch (cause) {
      setError(friendlyApiError(cause));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!open || initialized.current) return;
    initialized.current = true;
    void api
      .assistantConversations()
      .then(async ({ conversations: recent }) => {
        setConversations(recent);
        if (recent[0]) await selectConversation(recent[0].id);
      })
      .catch((cause) => setError(friendlyApiError(cause)));
  }, [open]);

  async function answer(
    question: string,
    contextOverride?: { entityId: string; entityType: EntityType }
  ) {
    setMessages((previous) => [...previous, { role: "user", content: question }]);
    setDraft("");
    setPending(true);
    setError("");

    try {
      if (mode === "intelligence") {
        // Query Organization Intelligence RAG (Agent 1)
        const history = messages.flatMap((message, index) => {
          if (message.role !== "user") return [];
          const reply = messages.slice(index + 1).find((item) => item.role === "assistant" && item.ragResponse);
          return reply?.ragResponse ? [{ query: message.content, answer: reply.ragResponse.answer }] : [];
        }).slice(-4);
        const ragRes = await api.organizationQuery({ query: question, history, topK: 8 });
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: ragRes.answer || "Answer backed by indexed sources:",
            ragResponse: ragRes,
          },
        ]);
      } else {
        // Query Knowledge Graph Assistant (Agent 2)
        const context =
          contextOverride ??
          (selected && selected.entityType !== "Unknown"
            ? {
                entityId: selected.entity.id,
                entityType: selected.entityType as EntityType,
              }
            : undefined);

        const response = await api.assistantQuery({
          question,
          ...(conversationId ? { conversationId } : {}),
          ...(context ? { context } : {}) as any,
        });

        setConversationId(response.conversationId ?? conversationId);
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: "Evidence-backed workspace response:",
            response,
          },
        ]);
        const recent = await api.assistantConversations();
        setConversations(recent.conversations);
      }
    } catch (cause) {
      const message = friendlyApiError(cause);
      setError(message);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: "The assistant workflow could not complete this request.",
        },
      ]);
    } finally {
      setPending(false);
      window.setTimeout(
        () =>
          messagesRef.current?.scrollTo({
            top: messagesRef.current.scrollHeight,
            behavior: "smooth",
          }),
        0
      );
    }
  }

  function action(
    type: "open_entity" | "show_dependencies" | "investigate",
    entityId: string
  ) {
    const response = [...messages].reverse().find((item) => item.response)?.response;
    const entity =
      response?.answer.related_entities.find((item) => item.id === entityId) ??
      response?.ui.graph.nodes.find((item) => item.id === entityId) ??
      response?.answer.citations.find((item) => item.entityId === entityId);
    if (!entity || !("entityType" in entity) || typeof entity.entityType !== "string")
      return;
    const entityType = entity.entityType;
    const graphDomain = "graphDomain" in entity ? entity.graphDomain : undefined;
    const isProduct = isProductGraphEntity(entityType, graphDomain);
    const path =
      entityType === "Employee"
        ? `/people/${entityId}`
        : entityType === "Department"
        ? `/departments/${entityId}`
        : entityType === "Project"
        ? `/projects/${entityId}`
        : `/org-graph?${isProduct ? "mode=product&" : ""}focus=${encodeURIComponent(
            entityId
          )}&type=${encodeURIComponent(entityType)}`;
    const entityRecord = { ...entity, id: entityId, entityType } as Entity;
    window.dispatchEvent(
      new CustomEvent("oig-graph-selection", {
        detail: { entity: entityRecord, entityType },
      })
    );
    if (type === "open_entity") window.location.assign(path);
    else
      window.dispatchEvent(
        new CustomEvent("oig-graph-focus", {
          detail: { id: entityId, type: entityType, mode: isProduct ? "product" : "team" },
        })
      );
    if (type === "investigate")
      void answer(`Investigate ${entityName(entityRecord)}`, {
        entityId,
        entityType: entityType as EntityType,
      });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim() && !pending) void answer(draft.trim());
  }

  const currentSuggestions = mode === "intelligence" ? ragSuggestions : graphSuggestions;

  if (!open) return null;
  return (
    <section className="assistant-panel" aria-label="OrgMind Intelligence assistant">
      <header className="assistant-header">
        <div className="assistant-title">
          <span className="assistant-title-icon">
            <Sparkles size={16} />
          </span>
          <div>
            <b>OrgMind Assistant</b>
            <small>
              {mode === "intelligence"
                ? "Agent 1 · Persistent RAG & Platform Vector Search"
                : "Agent 2 · LangGraph Entity & Timeline Investigation"}
            </small>
          </div>
        </div>

        <div className="assistant-header-actions">
          {mode === "graph" && conversations.length > 0 && (
            <select
              className="assistant-conversation-select"
              aria-label="Conversation history"
              value={conversationId ?? ""}
              onChange={(event) => void selectConversation(event.target.value)}
              disabled={pending}
            >
              {conversations.map((conversation) => (
                <option value={conversation.id} key={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="New conversation"
            title="New conversation"
            disabled={pending}
            onClick={() => {
              setConversationId(null);
              setMessages([mode === "intelligence" ? ragGreeting : graphGreeting]);
              setError("");
            }}
          >
            <MessageSquarePlus size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close assistant"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* Mode Switcher Tabs */}
      <div className="assistant-mode-bar">
        <button
          type="button"
          className={`assistant-mode-pill ${
            mode === "intelligence" ? "active" : ""
          }`}
          onClick={() => handleModeChange("intelligence")}
          disabled={pending}
        >
          <Sparkles size={12} />
          <span>Org Intelligence (RAG)</span>
        </button>
        <button
          type="button"
          className={`assistant-mode-pill ${mode === "graph" ? "active" : ""}`}
          onClick={() => handleModeChange("graph")}
          disabled={pending}
        >
          <Compass size={12} />
          <span>Graph Explorer</span>
        </button>
      </div>

      <div className="assistant-scope">
        {mode === "intelligence" ? (
          "Company knowledge · documents · conversations · code · API routes"
        ) : selected ? (
          `Context: ${selected.entityType} · ${entityName(selected.entity)}`
        ) : (
          "No graph selection. Ask about indexed company evidence."
        )}
      </div>

      <div className="assistant-messages" ref={messagesRef} aria-live="polite">
        {messages.map((message, index) => (
          <div
            className={`assistant-message ${message.role}`}
            key={`${index}:${message.role}`}
          >
            {!message.ragResponse && (
              <div className={`assistant-bubble ${message.role}`}>
                {message.role === "assistant" ? (
                  <Bot size={13} className="assistant-avatar" />
                ) : (
                  <UserRound size={13} className="assistant-avatar" />
                )}
                <div className="assistant-bubble-text">{message.content}</div>
              </div>
            )}
            {message.ragResponse && (
                <AgentResponseRenderer payload={message.ragResponse} />
              )}
            {!message.ragResponse && message.response && (
              <AgentResponseRenderer
                payload={message.response}
                onAction={action}
              />
            )}
          </div>
        ))}

        {messages.length === 1 && (
          <div className="suggestion-list">
            {currentSuggestions.map((suggestion) => (
              <button
                type="button"
                className="suggestion-chip"
                key={suggestion}
                onClick={() => void answer(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="assistant-bubble assistant">
            <span className="inline-loading">
              <span className="spinner" />
              {mode === "intelligence"
                ? "Searching vector embeddings across Jira, Confluence, Slack, GitHub and synthesizing answer…"
                : "Retrieving graph evidence and preparing response…"}
            </span>
          </div>
        )}

        {error && (
          <div className="panel-error" role="alert">
            {error}
            <button
              className="small-button"
              type="button"
              onClick={() => {
                const previous = messages.at(-1);
                if (previous?.role === "user") void answer(previous.content);
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <form className="assistant-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            mode === "intelligence"
              ? "Ask anything about your company…"
              : "Ask about people, decisions, or projects…"
          }
          aria-label="Ask OrgMind"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </form>
    </section>
  );
}
