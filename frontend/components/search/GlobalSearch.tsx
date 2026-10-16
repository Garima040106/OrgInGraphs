"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Building2, Search, UserRound, X } from "lucide-react";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { GraphEntityType, SearchResult } from "@/lib/types";

const iconFor = (type: GraphEntityType) => {
  if (type === "Employee") return UserRound;
  if (type === "Department" || type === "Team") return Building2;
  return BriefcaseBusiness;
};

const destination = (result: SearchResult) =>
  `/org-graph?${["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","Commit","Comment","Activity","Review"].includes(result.entityType) ? "mode=product&" : ""}focus=${encodeURIComponent(result.n.id)}&type=${encodeURIComponent(result.entityType)}`;

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setResults([]);
    setError("");
    setActive(0);
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
      previousFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !term.trim()) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        setResults(await api.search(term.trim(), controller.signal));
        setActive(0);
      } catch (reason) {
        if (!controller.signal.aborted) setError(friendlyApiError(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, term]);

  function select(result: SearchResult) {
    onClose();
    router.push(destination(result));
    window.dispatchEvent(new CustomEvent("oig-graph-focus", {
      detail: { id: result.n.id, type: result.entityType, mode: ["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","Commit","Comment","Activity","Review"].includes(result.entityType) ? "product" : "team" },
    }));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((index) => (index + results.length - 1) % results.length);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      select(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;
  return (
    <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search your organization" onKeyDown={trapFocus}>
        <div className="search-input-row">
          <Search size={17} />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search people, projects, and company knowledge..."
            aria-label="Search query"
            aria-controls="global-search-results"
            aria-expanded={results.length > 0}
          />
          {loading && <span className="spinner" aria-label="Searching" />}
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close search"><X size={15} /></button>
          <kbd>ESC</kbd>
        </div>
        <div className="search-results" id="global-search-results" role="listbox">
          {!term.trim() && <div className="search-empty">Search by a name, title, email, or topic.</div>}
          {error && <div className="search-empty">{error}</div>}
          {term.trim() && !loading && !error && results.length === 0 && <div className="search-empty">No matching records. Try another term.</div>}
          {results.length > 0 && <div className="search-caption">Company records</div>}
          {results.map((result, index) => {
            const Icon = iconFor(result.entityType);
            return (
              <button
                className={`search-result ${active === index ? "active" : ""}`}
                type="button"
                key={`${result.entityType}:${result.n.id}`}
                role="option"
                aria-selected={active === index}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(result)}
              >
                <span className="search-result-icon"><Icon size={14} /></span>
                <span><b>{entityName(result.n)}</b><small>{result.entityType}{typeof result.n.jobTitle === "string" ? ` · ${result.n.jobTitle}` : typeof result.n.email === "string" ? ` · ${result.n.email}` : ""}</small></span>
              </button>
            );
          })}
        </div>
        <footer className="search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>↵</kbd> to open <kbd>esc</kbd> to close</span></footer>
      </section>
    </div>
  );
}
