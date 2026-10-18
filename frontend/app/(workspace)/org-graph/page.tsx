"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Network, RefreshCw } from "lucide-react";
import { OrganizationGraph } from "@/components/graph/OrganizationGraph";
import { api, friendlyApiError } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";

type GraphMode = "team" | "product";
const emptyGraph: GraphResponse = { nodes: [], edges: [] };

export default function OrganizationGraphPage() {
  const [mode, setMode] = useState<GraphMode>("team");
  const [graph, setGraph] = useState<GraphResponse>(emptyGraph);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<{ id?: string; type?: string; request: number }>({ request: 0 });
  const [fromDocuments, setFromDocuments] = useState(false);

  const load = useCallback(async (selectedMode: GraphMode) => {
    setLoading(true);
    setError("");
    try {
      setGraph(selectedMode === "product" ? await api.productProgressGraph() : await api.graph());
    } catch (cause) {
      setError(friendlyApiError(cause));
      setGraph(emptyGraph);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMode: GraphMode = params.get("mode") === "product" ? "product" : "team";
    setMode(initialMode);
    setFocus({ id: params.get("focus") ?? undefined, type: params.get("type") ?? undefined, request: 1 });
    setFromDocuments(params.get("from") === "documents");
    void load(initialMode);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; type: string; mode?: GraphMode }>).detail;
      if (!detail?.id || !detail.type) return;
      if (detail.mode) setMode(detail.mode);
      setFocus((previous) => ({ ...detail, request: previous.request + 1 }));
    };
    window.addEventListener("oig-graph-focus", listener);
    return () => window.removeEventListener("oig-graph-focus", listener);
  }, [load]);

  useEffect(() => { void load(mode); }, [mode, load]);

  return <>
    <div className="page-heading graph-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-mark" /> Connected company data</div><h1>Organization graph</h1><p>Explore indexed entities, relationships, and dependencies.</p></div>
      <div className="graph-header-actions">{fromDocuments && <Link className="small-button" href="/documents">Back to Documentation</Link>}<button className="small-button" type="button" onClick={() => void load(mode)} disabled={loading}><RefreshCw size={12} /> Refresh graph</button></div>
    </div>
    <div className="graph-page-controls">
      <div className="graph-mode-switch" role="group" aria-label="Graph view">
        <button type="button" className={`graph-mode-option ${mode === "team" ? "active" : ""}`} aria-pressed={mode === "team"} onClick={() => setMode("team")}>Company</button>
        <button type="button" className={`graph-mode-option ${mode === "product" ? "active" : ""}`} aria-pressed={mode === "product"} onClick={() => setMode("product")}>Product</button>
      </div>
      <span className="graph-page-count"><Network size={12} /> {loading ? "Loading records…" : `${graph.nodes.length} records`}</span>
    </div>
    {error ? <div className="bento-api-alert" role="alert"><CircleAlert size={14} /><span><b>Graph data unavailable.</b> {error}</span><button className="small-button" type="button" onClick={() => void load(mode)}>Retry</button></div> : loading ? <div className="bento-loading graph-page-loading"><span className="spinner" /> Loading graph records…</div> : <OrganizationGraph graph={graph} graphMode={mode} focusId={focus.id} focusType={focus.type} focusRequest={focus.request} />}
  </>;
}
