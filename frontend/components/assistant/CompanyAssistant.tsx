"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUpRight, Bot, Compass, MessageSquarePlus, Send, Sparkles, UserRound, X } from "lucide-react";
import { AgentResponseRenderer } from "@/components/assistant/AgentResponseRenderer";
import { api, entityName, friendlyApiError } from "@/lib/api";
import { isProductGraphEntity } from "@/lib/graph/mode";
import type { AssistantConversation, AssistantResponse, AssistantTurn, Entity, EntityType, GraphEntityType, OrganizationRagResponse, RagQueryResponse } from "@/lib/types";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  response?: AssistantResponse;
  ragResponse?: OrganizationRagResponse | RagQueryResponse;
};

const newMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const ragGreeting: Message = {
  id: "rag-greeting",
  role: "assistant",
  content: "Ask about your company’s projects, people, incidents, decisions, and documentation. OrgMind searches indexed company evidence and cites the sources it uses.",
};
const graphGreeting: Message = {
  id: "graph-greeting",
  role: "assistant",
  content: "Ask about indexed company graph records. I can inspect ownership, decisions, dependencies, and connected evidence.",
};
const ragSuggestions = [
  "What is the engineering team working on?",
  "Summarize recent incidents.",
  "Who owns the checkout project?",
  "Find relevant documentation for a project.",
];
const graphSuggestions = ["Who owns billing?", "Why did we change authentication?", "What could break if we deprecate Auth v1?"];

export function CompanyAssistant({ open, onClose, selected }: {
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
  const [connection, setConnection] = useState<"checking" | "available" | "unavailable">("checking");
  const [ragStatus, setRagStatus] = useState<{ stats: { totalSources: number; totalChunks: number; pendingWork?: number }; vectorStore: string; embeddingModel: string } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const nearBottom = useRef(true);
  const submissionLock = useRef(false);
  const submissionOwner = useRef<number | null>(null);
  const lastFailedRequest = useRef<{ question: string; mode: "intelligence" | "graph"; context?: { entityId: string; entityType: EntityType } } | null>(null);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const container = messagesRef.current;
    if (!container) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? "auto" : behavior });
    nearBottom.current = true;
    setShowJump(false);
  }

  function invalidateActiveRequest() {
    requestSequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    submissionLock.current = false;
    submissionOwner.current = null;
    setPending(false);
  }

  function startNewChat() {
    invalidateActiveRequest();
    setConversationId(null);
    setMessages([mode === "intelligence" ? ragGreeting : graphGreeting]);
    setDraft("");
    setError("");
    lastFailedRequest.current = null;
    nearBottom.current = true;
    setShowJump(false);
  }

  function handleModeChange(newMode: "intelligence" | "graph") {
    if (newMode === mode) return;
    invalidateActiveRequest();
    setMode(newMode);
    setConversationId(null);
    setError("");
    lastFailedRequest.current = null;
    setMessages([newMode === "intelligence" ? ragGreeting : graphGreeting]);
  }

  async function selectConversation(id: string) {
    invalidateActiveRequest();
    const selectionId = ++requestSequence.current;
    setPending(true);
    setError("");
    try {
      const result = await api.assistantConversation(id);
      if (requestSequence.current !== selectionId) return;
      setConversationId(id);
      setMessages(result.turns.length ? result.turns.map((turn: AssistantTurn) => ({
        id: newMessageId(), role: turn.role, content: turn.content, response: turn.response, ragResponse: turn.ragResponse,
      })) : [graphGreeting]);
    } catch (cause) {
      if (requestSequence.current === selectionId) setError(friendlyApiError(cause));
    } finally {
      if (requestSequence.current === selectionId) setPending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    const refresh = () => {
      void api.health().then((health) => {
        if (active) setConnection(health.status === "ok" && health.database === "connected" ? "available" : "unavailable");
      }).catch(() => { if (active) setConnection("unavailable"); });
      if (mode === "intelligence") {
        void api.ragStatus().then((status) => { if (active) setRagStatus(status); }).catch(() => { if (active) setRagStatus(null); });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, mode]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [draft]);

  useEffect(() => {
    if (!open || mode !== "graph" || initialized.current) return;
    initialized.current = true;
    void api.assistantConversations().then(async ({ conversations: recent }) => {
      setConversations(recent);
      if (recent[0]) await selectConversation(recent[0].id);
    }).catch((cause) => setError(friendlyApiError(cause)));
  }, [open, mode]);

  useLayoutEffect(() => {
    const latest = messages.at(-1);
    if (latest?.role === "user") scrollToLatest("auto");
    else if (nearBottom.current) scrollToLatest("auto");
    else setShowJump(true);
  }, [messages]);

  useEffect(() => {
    const container = messagesRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") return;
    let previousHeight = content.scrollHeight;
    const observer = new ResizeObserver(() => {
      const currentHeight = content.scrollHeight;
      if (currentHeight === previousHeight) return;
      previousHeight = currentHeight;
      if (nearBottom.current) scrollToLatest("auto");
      else setShowJump(true);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [open]);

  function handleConversationScroll() {
    const container = messagesRef.current;
    if (!container) return;
    nearBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
    if (nearBottom.current) setShowJump(false);
  }

  async function answer(question: string, contextOverride?: { entityId: string; entityType: EntityType }, appendUser = true, requestMode: "intelligence" | "graph" = mode) {
    if (submissionLock.current) return;
    submissionLock.current = true;
    const currentRequest = ++requestSequence.current;
    submissionOwner.current = currentRequest;
    const requestController = new AbortController();
    controller.current = requestController;
    const userMessageId = newMessageId();
    if (appendUser) setMessages((previous) => [...previous, { id: userMessageId, role: "user", content: question }]);
    setPending(true);
    setError("");
    lastFailedRequest.current = null;

    try {
      if (requestMode === "intelligence") {
        const ragRes = await api.ragQuery(question, requestController.signal);
        if (requestSequence.current !== currentRequest) return;
        setMessages((previous) => [...previous, { id: newMessageId(), role: "assistant", content: ragRes.answer, ragResponse: ragRes }]);
      } else {
        const context = contextOverride ?? (selected && selected.entityType !== "Unknown" ? {
          entityId: selected.entity.id, entityType: selected.entityType as EntityType,
        } : undefined);
        const response = await api.assistantQuery({ question, ...(conversationId ? { conversationId } : {}), ...(context ? { context } : {}) });
        if (requestSequence.current !== currentRequest) return;
        setConversationId(response.conversationId ?? conversationId);
        setMessages((previous) => [...previous, { id: newMessageId(), role: "assistant", content: "", response }]);
        const recent = await api.assistantConversations();
        if (requestSequence.current === currentRequest) setConversations(recent.conversations);
      }
      if (requestSequence.current === currentRequest) {
        setDraft((previous) => previous === question ? "" : previous);
        composerRef.current?.focus();
      }
    } catch (cause) {
      if (requestSequence.current === currentRequest) {
        const message = friendlyApiError(cause);
        setError(message);
        if (appendUser) setDraft((previous) => previous || question);
        lastFailedRequest.current = { question, mode: requestMode, ...(contextOverride ? { context: contextOverride } : {}) };
      }
    } finally {
      if (requestSequence.current === currentRequest) {
        setPending(false);
        controller.current = null;
      }
      if (submissionOwner.current === currentRequest) {
        submissionLock.current = false;
        submissionOwner.current = null;
      }
    }
  }

  function action(type: "open_entity" | "show_dependencies" | "investigate", entityId: string) {
    const response = [...messages].reverse().find((item) => item.response)?.response;
    const entity = response?.answer.related_entities.find((item) => item.id === entityId)
      ?? response?.ui.graph.nodes.find((item) => item.id === entityId)
      ?? response?.answer.citations.find((item) => item.entityId === entityId);
    if (!entity || !("entityType" in entity) || typeof entity.entityType !== "string") return;
    const entityType = entity.entityType;
    const graphDomain = "graphDomain" in entity ? entity.graphDomain : undefined;
    const isProduct = isProductGraphEntity(entityType, graphDomain);
    const path = entityType === "Employee" ? `/people/${entityId}` : entityType === "Department" ? `/departments/${entityId}` : entityType === "Project" ? `/projects/${entityId}` : `/org-graph?${isProduct ? "mode=product&" : ""}focus=${encodeURIComponent(entityId)}&type=${encodeURIComponent(entityType)}`;
    const entityRecord = { ...entity, id: entityId, entityType } as Entity;
    window.dispatchEvent(new CustomEvent("oig-graph-selection", { detail: { entity: entityRecord, entityType } }));
    if (type === "open_entity") window.location.assign(path);
    else window.dispatchEvent(new CustomEvent("oig-graph-focus", { detail: { id: entityId, type: entityType, mode: isProduct ? "product" : "team" } }));
    if (type === "investigate") void answer(`Investigate ${entityName(entityRecord)}`, { entityId, entityType: entityType as EntityType });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (question && !pending) void answer(question);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const question = draft.trim();
      if (question && !pending) void answer(question);
    }
  }

  const currentSuggestions = mode === "intelligence" ? ragSuggestions : graphSuggestions;
  const connected = connection === "available" && (mode !== "intelligence" || ragStatus?.vectorStore !== "unavailable");
  if (!open) return null;

  return <section className="assistant-panel" aria-label="OrgMind Assistant">
    <header className="assistant-header">
      <div className="assistant-title">
        <span className="assistant-title-icon"><img src="/img/logo.png" alt="" width={24} height={24} /></span>
        <div className="assistant-heading-copy">
          <b>OrgMind Assistant</b>
          <span className={`assistant-connection ${connected ? "is-available" : connection === "checking" ? "is-checking" : "is-unavailable"}`} role="status">
            <i aria-hidden="true" />{connected ? "Connected" : connection === "checking" ? "Checking connection" : "Backend unavailable"}
          </span>
        </div>
      </div>
      <div className="assistant-header-actions">
        {mode === "graph" && conversations.length > 0 && <select className="assistant-conversation-select" aria-label="Conversation history" value={conversationId ?? ""} onChange={(event) => void selectConversation(event.target.value)}>
          {conversations.map((conversation) => <option value={conversation.id} key={conversation.id}>{conversation.title}</option>)}
        </select>}
        <button type="button" className="icon-button" aria-label="New chat" title="New chat" onClick={startNewChat}><MessageSquarePlus size={16} /></button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close assistant"><X size={16} /></button>
      </div>
    </header>

    <div className="assistant-mode-bar" role="tablist" aria-label="Assistant mode">
      <button type="button" role="tab" aria-selected={mode === "intelligence"} className={`assistant-mode-pill ${mode === "intelligence" ? "active" : ""}`} onClick={() => handleModeChange("intelligence")}><Sparkles size={14} /><span>Company knowledge</span></button>
      <button type="button" role="tab" aria-selected={mode === "graph"} className={`assistant-mode-pill ${mode === "graph" ? "active" : ""}`} onClick={() => handleModeChange("graph")}><Compass size={14} /><span>Graph Explorer</span></button>
    </div>

    <div className="assistant-context-line">
      <span>{mode === "intelligence" ? "Search across indexed company knowledge" : selected ? `Context: ${selected.entityType} · ${entityName(selected.entity)}` : "Explore relationships in the company graph"}</span>
      {mode === "intelligence" && ragStatus && <span>{ragStatus.stats.totalSources} sources · {ragStatus.stats.totalChunks} chunks</span>}
    </div>

    <div className="assistant-messages" ref={messagesRef} onScroll={handleConversationScroll} role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      <div className="assistant-message-list" ref={contentRef}>
        {messages.length === 1 ? <div className="assistant-empty-state">
          <div className="assistant-welcome">
            <span className="assistant-welcome-mark"><Sparkles size={18} /></span>
            <p className="assistant-welcome-eyebrow">COMPANY INTELLIGENCE</p>
            <h2>{mode === "intelligence" ? "Your company, connected." : "Explore the company graph."}</h2>
            <p>{mode === "intelligence" ? "Search projects, people, incidents, decisions, and company documentation." : "Investigate how teams, services, decisions, and projects connect."}</p>
          </div>
          <div className="suggestion-list" aria-label="Suggested questions">
            {currentSuggestions.map((suggestion) => <button type="button" className="suggestion-chip" key={suggestion} disabled={pending} onClick={() => void answer(suggestion)}><span>{suggestion}</span><ArrowUpRight size={15} aria-hidden="true" /></button>)}
          </div>
        </div> : messages.map((message) => <div className={`assistant-message ${message.role}`} key={message.id}>
          {!message.ragResponse && <div className={`assistant-bubble ${message.role}`}>
            {message.role === "assistant" ? <Bot size={14} className="assistant-avatar" aria-hidden="true" /> : <UserRound size={14} className="assistant-avatar" aria-hidden="true" />}
            {message.content && <div className="assistant-bubble-text">{message.content}</div>}
          </div>}
          {message.ragResponse && <AgentResponseRenderer payload={message.ragResponse} messageId={message.id} />}
          {!message.ragResponse && message.response && <AgentResponseRenderer payload={message.response} onAction={action} messageId={message.id} />}
        </div>)}
        {pending && <div className="assistant-pending" role="status"><span className="spinner" />{mode === "intelligence" ? "Searching company sources and preparing an answer…" : "Retrieving graph evidence…"}</div>}
        {error && <div className="assistant-error" role="alert"><span>{error}</span>{lastFailedRequest.current && <button className="small-button" type="button" onClick={() => {
          const failed = lastFailedRequest.current;
          if (failed) void answer(failed.question, failed.context, false, failed.mode);
        }}>Retry</button>}</div>}
      </div>
      {showJump && <button className="assistant-jump-latest" type="button" onClick={() => scrollToLatest()}><ArrowDown size={14} /> Jump to latest</button>}
    </div>

    <form className="assistant-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="orgmind-composer">Ask anything about your company</label>
      <textarea id="orgmind-composer" ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Ask anything about your company…" rows={1} disabled={pending} />
      <button type="submit" disabled={pending || !draft.trim()} aria-label={pending ? "Waiting for response" : "Send message"} title="Send message">{pending ? <span className="spinner" /> : <Send size={16} />}</button>
      <span className="assistant-composer-hint">Enter to send · Shift+Enter for a new line</span>
    </form>
    <p className="assistant-disclaimer">Answers are grounded in indexed company sources. Verify important details with the references.</p>
  </section>;
}
