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
import { normalizeNeighborhood, type GraphNodeData } from "@/lib/graph/normalize";
import type { EntityType, GraphResponse, Neighborhood } from "@/lib/types";

type GraphSelection = { entity: GraphNodeData["entity"]; entityType: GraphNodeData["entityType"] };

function EntityCardNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const type = data.entityType;
  const Icon = type === "Employee" ? UserRound : type === "Department" ? Building2 : type === "Project" ? BriefcaseBusiness : Network;
  const initials = data.label.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <div className={`entity-node ${type.toLowerCase()} ${selected ? "selected" : ""}`} title={`${data.label} · ${type}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-topline">
        {type === "Employee" ? <span className="node-avatar">{initials}</span> : <span className="node-icon"><Icon size={14} /></span>}
        <div><div className="node-label">{data.label}</div><div className="node-subtitle">{data.subtitle}</div></div>
      </div>
      <div className="node-type">{type}</div>
      <Handle type="source" position={Position.Right} />
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

function GraphCanvas({
  initialNodes,
  initialEdges,
  totalEmployees,
  onSelection,
  focusId,
  focusType,
}: {
  initialNodes: Node<GraphNodeData>[];
  initialEdges: Edge[];
  totalEmployees: number;
  onSelection?: (selection: GraphSelection | null) => void;
  focusId?: string;
  focusType?: string;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
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
        const normalized = normalizeNeighborhood(data, root, new Set(nodes.map((node) => node.id)), nodes.length, { x: 700, y: 360 });
        const rootNode = {
          id: root.id,
          type: "entity",
          position: { x: 700, y: 360 },
          data: { entity: root, entityType: root.entityType ?? focusType as EntityType, label: String(root.name ?? root.title ?? root.id), subtitle: String(root.jobTitle ?? root.status ?? root.entityType ?? focusType) },
        } as Node<GraphNodeData>;
        setNodes((previous) => [...previous, rootNode, ...normalized.nodes]);
        setEdges((previous) => [...previous, ...normalized.edges]);
        setSelectedId(root.id);
        window.setTimeout(() => void fitView({ nodes: [rootNode], duration: 500, padding: .45 }), 100);
      }).catch((error: unknown) => setPanelError(friendlyApiError(error)));
    }
  // Focus is a navigation event and should only run when the query identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusType]);

  const selectNode = useCallback((_event: React.MouseEvent, node: Node<GraphNodeData>) => {
    setSelectedId(node.id);
  }, []);

  async function expandSelected() {
    if (!selectedNode || expandedIds.has(selectedNode.id) || expanding) return;
    const type = selectedNode.data.entityType;
    if (type === "Unknown") {
      setPanelError("The API did not return an entity type for this record, so its neighborhood cannot be loaded safely.");
      return;
    }
    setExpanding(true);
    setPanelError("");
    try {
      const neighborhood: Neighborhood = await api.neighborhood(type, selectedNode.id);
      const alreadyKnown = new Set(nodes.map((node) => node.id));
      const normalized = normalizeNeighborhood(neighborhood, selectedNode.data.entity, alreadyKnown, nodes.length, selectedNode.position);
      setNodes((previous) => [...previous, ...normalized.nodes]);
      setEdges((previous) => {
        const ids = new Set(previous.map((edge) => edge.id));
        return [...previous, ...normalized.edges.filter((edge) => !ids.has(edge.id))];
      });
      setExpandedIds((previous) => new Set(previous).add(selectedNode.id));
      if (!normalized.nodes.length && !normalized.edges.length) setPanelError("There are no new connections to show for this record.");
    } catch (error) {
      setPanelError(friendlyApiError(error));
    } finally {
      setExpanding(false);
    }
  }

  const activeEdges = useMemo(() => edges.map((edge) => {
    const isConnected = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
    return {
      ...edge,
      style: { stroke: selectedId ? (isConnected ? "#6d80dc" : "#dfe3eb") : "#cbd1de", strokeWidth: isConnected ? 1.8 : 1 },
      labelStyle: { fill: isConnected ? "#6978bb" : "#9aa2b0", fontSize: 13 },
      labelBgStyle: { fill: "#fff", fillOpacity: .9 },
    };
  }), [edges, selectedId]);

  function resetGraph() {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedId(null);
    setExpandedIds(new Set());
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
        <div className="graph-heading-left"><Network size={14} /> Organization graph <span style={{ color: "#9aa2b0", fontWeight: 450 }}>· {nodes.length} records · {totalEmployees} people</span></div>
        <div className="graph-legend">
          <span><i className="legend-mark" style={{ background: "#7188e5" }} /> People</span>
          <span><i className="legend-mark" style={{ background: "#9a84dd" }} /> Departments</span>
          <span><i className="legend-mark" style={{ background: "#d8a76c" }} /> Projects</span>
          <button type="button" className="icon-button" title="Reset graph" aria-label="Reset graph" onClick={resetGraph}><RotateCcw size={13} /></button>
        </div>
      </div>
      <div className="graph-body">
        {nodes.length ? (
          <ReactFlow
            nodes={nodes.map((node) => ({ ...node, selected: node.id === selectedId }))}
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
              return type === "Employee" ? "#9ca9e8" : type === "Department" ? "#b8a8df" : type === "Project" ? "#dfbd8c" : "#b9c3d4";
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
            <div className="inspector-head"><span>Record details</span><button type="button" className="icon-button" onClick={() => setSelectedId(null)} aria-label="Close inspector"><X size={14} /></button></div>
            <div className="inspector-identity">
              <span className={`node-icon ${selectedNode.data.entityType.toLowerCase()}`}><GitBranch size={15} /></span>
              <div><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.entityType} · {selectedNode.data.subtitle}</p></div>
            </div>
            <div className="inspector-actions">
              <button className="small-button" type="button" onClick={() => void expandSelected()} disabled={expanding || expandedIds.has(selectedNode.id)}>
                {expanding ? <span className="spinner" /> : <Network size={12} />}
                {expanding ? "Loading" : expandedIds.has(selectedNode.id) ? "Expanded" : "Expand"}
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
  focusId?: string;
  focusType?: string;
  onSelection?: (selection: GraphSelection | null) => void;
}) {
  const initial = useMemo(
    () => buildInitialGraph(props.graph),
    [props.graph],
  );
  return (
    <div className="graph-workspace">
      <ReactFlowProvider>
        <GraphCanvas
          initialNodes={initial.nodes}
          initialEdges={initial.edges}
          totalEmployees={initial.totalEmployees}
          focusId={props.focusId}
          focusType={props.focusType}
          onSelection={props.onSelection}
        />
      </ReactFlowProvider>
    </div>
  );
}
