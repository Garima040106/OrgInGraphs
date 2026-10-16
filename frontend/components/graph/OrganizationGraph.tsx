"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleHelp,
  Expand,
  GitBranch,
  Network,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import { buildInitialGraph } from "@/lib/graph/layout";
import { graphRootId, normalizeNeighborhood, organizationGraph, toGraphNode, type GraphNodeData } from "@/lib/graph/normalize";
import { useExpandableGraph } from "@/lib/graph/useExpandableGraph";
import type { GraphEntityType, GraphResponse, Neighborhood } from "@/lib/types";

type GraphSelection = { entity: GraphNodeData["entity"]; entityType: GraphNodeData["entityType"] };

function EntityCardNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const type = data.entityType;
  const Icon = type === "Employee" ? UserRound : type === "Department" ? Building2 : type === "Project" ? BriefcaseBusiness : Network;
  const initials = data.label.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <div className={`entity-node ${type.toLowerCase()} ${selected ? "selected" : ""}`} title={`${data.label} · ${type}`}>
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-left" type="source" position={Position.Left} />
      <div className="node-topline">
        {type === "Employee" ? <span className="node-avatar">{initials}</span> : <span className="node-icon"><Icon size={14} /></span>}
        <div className="node-copy"><div className="node-label">{data.label}</div><div className="node-subtitle">{data.subtitle}</div></div>
      </div>
      <div className="node-footer">
        <span className="node-footer-labels">
          <span className="node-type">{type}</span>
          <span className="node-source" title="Record source">{entitySource(data.entity)}</span>
        </span>
        <button
          className="node-expand-button"
          type="button"
          title={
            data.hasChildren === false
              ? `${data.label} is a terminal record`
              : data.isExpanded
                ? `Collapse connections for ${data.label}`
                : `Expand connections for ${data.label}`
          }
          aria-label={
            data.hasChildren === false
              ? `${data.label} is a terminal record`
              : data.isExpanded
                ? `Collapse connections for ${data.label}`
                : `Expand connections for ${data.label}`
          }
          disabled={data.isExpanding || data.hasChildren === false}
          onClick={(event) => {
            event.stopPropagation();
            data.onExpand?.();
          }}
        >
          {data.isExpanding ? <span className="spinner" /> : <ChevronRight size={12} />}
          {data.isExpanding ? "Loading" : data.hasChildren === false ? "Terminal" : data.isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="source-right" type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { entity: EntityCardNode };

function detailPath(entityType: string, id: string) {
  if (entityType === "Employee") return `/people/${encodeURIComponent(id)}`;
  if (entityType === "Department") return `/departments/${encodeURIComponent(id)}`;
  if (entityType === "Project") return `/projects/${encodeURIComponent(id)}`;
  return null;
}

function entitySource(entity: GraphNodeData["entity"]): string {
  const source = typeof entity.sourceSystem === "string" ? entity.sourceSystem.trim() : "";
  const normalized = source.toLowerCase();
  if (normalized.includes("confluence")) return "Confluence";
  if (normalized === "jira" || normalized.includes("atlassian")) return "Jira";
  if (normalized.includes("slack")) return "Slack";
  if (normalized.includes("github")) return "GitHub";
  if (normalized.includes("discord")) return "Discord";
  if (normalized.includes("falkor")) return "FalkorDB";
  return "FalkorDB";
}

export function GraphRenderer({
  initialNodes,
  initialEdges,
  fullGraph,
  totalEmployees,
  graphMode,
  onSelection,
  focusId,
  focusType,
  focusRequest,
}: {
  initialNodes: Node<GraphNodeData>[];
  initialEdges: Edge[];
  fullGraph: GraphResponse;
  totalEmployees: number;
  graphMode: "team" | "product";
  onSelection?: (selection: GraphSelection | null) => void;
  focusId?: string;
  focusType?: string;
  focusRequest: number;
}) {
  const { nodes, edges, expandedIds, expandingId, toggle: toggleExpansion, replace: replaceGraph, reset: resetExpandableGraph } = useExpandableGraph(fullGraph, initialNodes, initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    setSelectedId(null);
    setPanelError("");
  }, [initialEdges, initialNodes]);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const connected = useMemo(() => {
    if (!selectedId) return [];
    return edges.flatMap((edge) => {
      if (edge.source === selectedId) return [{ id: edge.target, relationship: edge.label, direction: "outgoing" }];
      if (edge.target === selectedId) return [{ id: edge.source, relationship: edge.label, direction: "incoming" }];
      return [];
    }).map((connection) => ({ ...connection, node: nodes.find((node) => node.id === connection.id) }))
      .filter((connection) => connection.node);
  }, [edges, nodes, selectedId]);

  useEffect(() => {
    if (!selectedNode) {
      setDetail(null);
      setDetailLoading(false);
      onSelection?.(null);
      window.dispatchEvent(new CustomEvent("oig-graph-selection", { detail: null }));
      return;
    }
    const selection = { entity: selectedNode.data.entity, entityType: selectedNode.data.entityType };
    onSelection?.(selection);
    window.dispatchEvent(new CustomEvent("oig-graph-selection", { detail: selection }));
    setPanelError("");
    setDetailLoading(true);
    const type = selectedNode.data.entityType;
    let active = true;
    const load = type === "Employee"
      ? api.employee(selectedNode.id)
      : type === "Department"
        ? api.department(selectedNode.id)
        : type === "Project"
          ? api.project(selectedNode.id)
          : Promise.resolve(selectedNode.data.entity);
    load.then((result) => { if (active) setDetail(result as unknown as Record<string, unknown>); })
      .catch((error: unknown) => { if (active) setPanelError(friendlyApiError(error)); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [onSelection, selectedNode]);

  useEffect(() => {
    if (!focusId) return;
    const target = nodes.find((node) => node.id === focusId);
    if (target) {
      setSelectedId(target.id);
      window.setTimeout(() => void fitView({ nodes: [target], duration: 500, padding: .45 }), 100);
    } else if (focusType && focusType !== "Unknown") {
      void api.neighborhood(focusType, focusId).then((data) => {
        const root = data.nodes.find((node) => node.id === focusId);
        if (!root) return;
        const rootEntity = { ...root, entityType: root.entityType ?? focusType as GraphEntityType };
        const rootNode = toGraphNode(rootEntity, { x: 900, y: 360 });
        const normalized = normalizeNeighborhood(data, rootEntity, [...nodes, rootNode], rootNode.position);
        // Focus navigation is intentionally additive; ordinary graph expansion remains hook-owned.
        // This preserves existing search/deep-link behavior without changing the graph data source.
        replaceGraph([rootNode, ...normalized.nodes], normalized.edges);
        setSelectedId(root.id);
        window.setTimeout(() => void fitView({ nodes: [rootNode], duration: 500, padding: .45 }), 100);
      }).catch((error: unknown) => setPanelError(friendlyApiError(error)));
    }
  // Focus is a navigation event and should only run when the query identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusType, focusRequest]);

  const selectNode = useCallback((_event: React.MouseEvent, node: Node<GraphNodeData>) => {
    setSelectedId(node.id);
  }, []);

  async function expandNode(nodeToExpand: Node<GraphNodeData>) {
    if (expandingId) return;
    const type = nodeToExpand.data.entityType;
    if (type === "Unknown") {
      setPanelError("The API did not return an entity type for this record, so its neighborhood cannot be loaded safely.");
      return;
    }
    setPanelError("");
    try {
      const toggled = toggleExpansion(nodeToExpand.id);
      if (toggled) {
        window.setTimeout(() => void fitView({ duration: 450, padding: .24 }), 50);
      }
    } catch (error) {
      setPanelError(friendlyApiError(error));
    } finally {
    }
  }

  const activeEdges = useMemo(() => edges.map((edge) => {
    const isConnected = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
    return {
      ...edge,
      type: "default",
      style: {
        stroke: selectedId ? (isConnected ? "#6366f1" : "#e2e8f0") : "#cbd5e1",
        strokeWidth: isConnected ? 2 : 1.5,
        strokeLinecap: "round" as const,
        transition: "stroke 0.2s, stroke-width 0.2s",
      },
      labelStyle: { fill: isConnected ? "#4f46e5" : "#64748b", fontSize: 12, fontWeight: 500 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
    };
  }), [edges, selectedId]);

  function resetGraph() {
    resetExpandableGraph();
    setSelectedId(null);
    setPanelError("");
    window.setTimeout(() => void fitView({ duration: 500, padding: .16 }), 40);
  }

  const properties = detail ? (
    detail.employee && typeof detail.employee === "object" ? detail.employee as Record<string, unknown> :
      detail.department && typeof detail.department === "object" ? detail.department as Record<string, unknown> :
        detail
  ) : selectedNode?.data.entity;
  const fieldRows = properties ? Object.entries(properties).filter(([key, value]) => {
    return !["id", "profilePictureUrl", "skills", "sourceRecordId", "sourceSystem", "externalUrl", "createdAt", "updatedAt"].includes(key)
      && (typeof value === "string" || typeof value === "number" || typeof value === "boolean");
  }).slice(0, 7) : [];
  const path = selectedNode ? detailPath(selectedNode.data.entityType, selectedNode.id) : null;

  return (
    <>
      <div className="graph-heading">
        <div className="graph-heading-left"><span className="graph-title-icon"><Network size={14} /></span><span><strong>{graphMode === "product" ? "Product progress graph" : "Organization graph"}</strong><small>{nodes.length} records{graphMode === "team" ? ` · ${totalEmployees} people` : ""}</small></span></div>
        <div className="graph-legend">
          {graphMode === "team" ? <><span><i className="legend-mark" style={{ background: "#7188e5" }} /> People</span><span><i className="legend-mark" style={{ background: "#9a84dd" }} /> Departments</span><span><i className="legend-mark" style={{ background: "#d8a76c" }} /> Projects</span></> : <><span><i className="legend-mark" style={{ background: "#6d80dc" }} /> Products</span><span><i className="legend-mark" style={{ background: "#d89b6c" }} /> Work items</span><span><i className="legend-mark" style={{ background: "#8e9bb7" }} /> People / teams</span></>}
          <button type="button" className="icon-button" title="Reset graph" aria-label="Reset graph" onClick={resetGraph}><RotateCcw size={13} /></button>
        </div>
      </div>
      <div className="graph-body">
        {nodes.length ? (
          <ReactFlow
            nodes={nodes.map((node) => ({
              ...node,
              selected: node.id === selectedId,
              data: {
                ...node.data,
                onExpand: () => {
                  setSelectedId(node.id);
                  void expandNode(node);
                },
                isExpanded: expandedIds.has(node.id),
                isExpanding: expandingId === node.id,
              },
            }))}
            edges={activeEdges}
            onNodeClick={selectNode}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: .16, maxZoom: 1.05 }}
            minZoom={.15}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements
          >
            <Background color="#e8ebf2" gap={19} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap position="top-right" pannable zoomable nodeColor={(node) => {
              const type = (node.data as GraphNodeData).entityType;
              return type === "Employee" ? "#9ca9e8" : type === "Department" ? "#b8a8df" : type === "Project" ? "#dfbd8c" : graphMode === "product" && type === "Product" ? "#6d80dc" : graphMode === "product" && ["Feature", "Ticket", "Bug", "PullRequest", "Release"].includes(type) ? "#d89b6c" : "#b9c3d4";
            }} />
            <div className="graph-fit-actions">
              <button className="small-button" type="button" onClick={() => void fitView({ duration: 400, padding: .16 })}><Expand size={12} /> Fit</button>
              <button className="small-button" type="button" onClick={() => void zoomIn()} aria-label="Zoom in">+</button>
              <button className="small-button" type="button" onClick={() => void zoomOut()} aria-label="Zoom out">−</button>
            </div>
          </ReactFlow>
        ) : (
          <div className="empty-state"><Network size={21} /><b>No organization records to visualize</b><p>Check that the backend is connected and that the graph has been seeded.</p></div>
        )}
        <div className="graph-hint"><CircleHelp size={11} style={{ verticalAlign: "middle", marginRight: 5 }} />Select a node for context. Expand it to load connected records.</div>
        {selectedNode && (
          <aside className="inspector" aria-label="Selected record details">
            <div className="inspector-head"><span><small>SELECTED RECORD</small>Record details</span><button type="button" className="icon-button" onClick={() => setSelectedId(null)} aria-label="Close inspector"><X size={14} /></button></div>
            <div className="inspector-identity">
              <span className={`node-icon ${selectedNode.data.entityType.toLowerCase()}`}><GitBranch size={15} /></span>
              <div><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.entityType} · {selectedNode.data.subtitle}</p></div>
            </div>
            <div className="inspector-source"><span>Record source</span><b>{entitySource(selectedNode.data.entity)}</b></div>
            <div className="inspector-actions">
              <button
                className="small-button"
                type="button"
                onClick={() => void expandNode(selectedNode)}
                disabled={!!expandingId || selectedNode.data.hasChildren === false}
                title={selectedNode.data.hasChildren === false ? "Terminal record — no descendants to expand" : undefined}
              >
                {expandingId === selectedNode.id ? <span className="spinner" /> : <Network size={12} />}
                {expandingId === selectedNode.id
                  ? "Loading"
                  : selectedNode.data.hasChildren === false
                    ? "Terminal"
                    : expandedIds.has(selectedNode.id)
                      ? "Collapse"
                      : "Expand"}
              </button>
              {path && <Link href={path} className="small-button">Open profile <ArrowUpRight size={11} /></Link>}
            </div>
            {panelError && <div className="panel-error">{panelError}</div>}
            {detailLoading && <div className="inspector-section"><span className="inline-loading"><span className="spinner" />Loading record details…</span></div>}
            {fieldRows.length > 0 && <div className="inspector-section"><h4>Available information</h4>{fieldRows.map(([key, value]) => <div className="metadata-row" key={key}><span>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span><span>{String(value)}</span></div>)}</div>}
            {!!connected.length && <div className="inspector-section"><h4>Connected records · {connected.length}</h4>{connected.slice(0, 7).map((item) => <div className="connection-item" key={`${item.id}:${item.relationship}`}><span className="connection-bullet"><ChevronRight size={11} /></span><span>{item.node?.data.label}<small style={{ display: "block", color: "#a0a7b3", marginTop: 2 }}>{String(item.relationship || "connected")} · {item.direction}</small></span></div>)}</div>}
            {selectedNode.data.entityType !== "Employee" && selectedNode.data.entityType !== "Department" && selectedNode.data.entityType !== "Project" && <div className="inspector-section"><h4>Connection note</h4><div className="metadata-row"><span>Backend provides</span><span>Graph neighborhood</span></div></div>}
          </aside>
        )}
      </div>
      <span className="sr-only">Showing all {totalEmployees} employees and their graph connections. Expand nodes for additional verified connections.</span>
    </>
  );
}

export function OrganizationGraph(props: {
  graph: GraphResponse;
  graphMode?: "team" | "product";
  focusId?: string;
  focusType?: string;
  focusRequest: number;
  onSelection?: (selection: GraphSelection | null) => void;
}) {
  const sourceGraph = useMemo(() => props.graphMode === "product" ? props.graph : organizationGraph(props.graph), [props.graph, props.graphMode]);
  const initial = useMemo(
    () => buildInitialGraph(sourceGraph),
    [sourceGraph],
  );
  return (
    <div className="graph-workspace">
      <ReactFlowProvider>
        <GraphRenderer
          initialNodes={initial.nodes}
          initialEdges={initial.edges}
          fullGraph={sourceGraph}
          totalEmployees={initial.totalEmployees}
          graphMode={props.graphMode ?? "team"}
          focusId={props.focusId}
          focusType={props.focusType}
          focusRequest={props.focusRequest}
          onSelection={props.onSelection}
        />
      </ReactFlowProvider>
    </div>
  );
}
