"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Send, Sparkles, UserRound, X } from "lucide-react";
import { api, entityName } from "@/lib/api";
import type { Entity, GraphEntityType, SearchResult } from "@/lib/types";

type Message = { role: "assistant" | "user"; content: string; sources?: SearchResult[] };

const suggestions = [
  "Who works on this project?",
  "Show me this employee's team and connections.",
  "Find people connected to idempotency.",
];

function recordPath(result: SearchResult) {
  if (result.entityType === "Employee") return `/people/${encodeURIComponent(result.n.id)}`;
  if (result.entityType === "Department") return `/departments/${encodeURIComponent(result.n.id)}`;
  if (result.entityType === "Project") return `/projects/${encodeURIComponent(result.n.id)}`;
  return `/dashboard?focus=${encodeURIComponent(result.n.id)}&type=${encodeURIComponent(result.entityType)}`;
}

function cleanSearchTerm(message: string) {
  return message
    .replace(/\b(who|works|work|on|this|that|project|show|me|team|and|connections|find|people|connected|to|the|which|are|associated|with|departments|about|tell|what|know|does|do)\b/gi, " ")
    .replace(/[?.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function CompanyAssistant({
  open,
  onClose,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  selected?: { entity: Entity; entityType: GraphEntityType | "Unknown" } | null;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "I can look up verified company records using search and detail data. I don't generate answers beyond what the workspace data supports." },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  async function answer(question: string) {
    const userMessage: Message = { role: "user", content: question };
    setMessages((previous) => [...previous, userMessage]);
    setDraft("");
    setPending(true);
    try {
      if (selected?.entityType === "Employee" && /team|connection|project|report|manager/i.test(question)) {
        const detail = await api.employee(selected.entity.id);
        const links = [
          detail.manager ? `Manager: ${entityName(detail.manager)}` : "",
          detail.department ? `Department: ${entityName(detail.department)}` : "",
          detail.team ? `Team: ${entityName(detail.team)}` : "",
          detail.directReports.length ? `Direct reports: ${detail.directReports.map(entityName).join(", ")}` : "",
          detail.projects.length ? `Projects: ${detail.projects.map(entityName).join(", ")}` : "",
        ].filter(Boolean);
        setMessages((previous) => [...previous, {
          role: "assistant",
          content: links.length ? `${detail.employee.name ?? detail.employee.id}\n${links.join("\n")}` : "The employee record doesn't include connected teams, managers, reports, or projects.",
        }]);
        return;
      }
      if (selected?.entityType === "Project" && /who|people|works|employee|team|department/i.test(question)) {
        const detail = await api.project(selected.entity.id);
        const people = [...new Map([...detail.owners, ...detail.employees].map((person) => [person.id, person])).values()];
        setMessages((previous) => [...previous, {
          role: "assistant",
          content: people.length ? `${detail.name ?? detail.id} is connected to ${people.length} employee record${people.length === 1 ? "" : "s"}: ${people.map(entityName).join(", ")}.` : "The project record does not include any linked employees.",
          sources: [{ entityType: "Project", n: detail }],
        }]);
        return;
      }
      const term = cleanSearchTerm(question);
      if (!term) {
        setMessages((previous) => [...previous, { role: "assistant", content: "Name a person, project, department, or topic and I can search the workspace records. You can also select a graph node first for a contextual lookup." }]);
        return;
      }
      const matches = await api.search(term);
      if (!matches.length) {
        setMessages((previous) => [...previous, { role: "assistant", content: `I couldn't find a workspace record matching “${term}”. I only answer from records returned by company search.` }]);
        return;
      }
      const people = matches.filter((match) => match.entityType === "Employee");
      const projects = matches.filter((match) => match.entityType === "Project");
      const departments = matches.filter((match) => match.entityType === "Department");
      const answer = [
        people.length ? `People: ${people.map((item) => entityName(item.n)).join(", ")}` : "",
        projects.length ? `Projects: ${projects.map((item) => entityName(item.n)).join(", ")}` : "",
        departments.length ? `Departments: ${departments.map((item) => entityName(item.n)).join(", ")}` : "",
        !people.length && !projects.length && !departments.length ? `Matching records: ${matches.slice(0, 5).map((item) => `${item.entityType}: ${entityName(item.n)}`).join(", ")}` : "",
      ].filter(Boolean).join("\n");
      setMessages((previous) => [...previous, { role: "assistant", content: answer, sources: matches.slice(0, 5) }]);
    } catch {
      setMessages((previous) => [...previous, { role: "assistant", content: "I couldn't retrieve a reliable answer from the company data service. Please try again when the workspace is connected." }]);
    } finally {
      setPending(false);
      window.setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }), 0);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    void answer(draft.trim());
  }

  if (!open) return null;
  return (
    <section className="assistant-panel" aria-label="OIG Intelligence assistant">
      <header className="assistant-header"><div className="assistant-title"><span className="assistant-title-icon"><Sparkles size={15} /></span><span><b>OIG Intelligence</b><small>Verified record lookups</small></span></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close assistant"><X size={15} /></button></header>
      <div className="assistant-scope">{selected ? `Context: ${selected.entityType} · ${String(selected.entity.name ?? selected.entity.title ?? selected.entity.id)}` : "No graph selection. Ask about a specific name or topic."} Answers use workspace API records only.</div>
      <div className="assistant-messages" ref={messagesRef} aria-live="polite">
        {messages.map((message, index) => <div className={`assistant-bubble ${message.role}`} key={`${index}:${message.role}`}>{message.content}
          {!!message.sources?.length && <div className="tag-row" style={{ marginTop: 8 }}>{message.sources.map((source) => <Link className="tag" key={`${source.entityType}:${source.n.id}`} href={recordPath(source)}>{source.entityType} <ArrowUpRight size={9} /></Link>)}</div>}
        </div>)}
        {messages.length === 1 && <div className="suggestion-list">{suggestions.map((suggestion) => <button type="button" className="suggestion-chip" key={suggestion} onClick={() => void answer(suggestion)}>{suggestion}</button>)}</div>}
        {pending && <div className="assistant-bubble"><span className="inline-loading"><span className="spinner" />Checking company records…</span></div>}
      </div>
      <form className="assistant-form" onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about a person or project…" aria-label="Ask OIG Intelligence" /><button type="submit" disabled={pending || !draft.trim()} aria-label="Send message"><Send size={14} /></button></form>
    </section>
  );
}
