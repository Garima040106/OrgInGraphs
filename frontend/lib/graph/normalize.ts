import type { Edge, Node } from "@xyflow/react";
import type { Entity, GraphEntityType, GraphResponse, Neighborhood } from "@/lib/types";

export type GraphNodeData = {
  entity: Entity;
  entityType: GraphEntityType | "Unknown";
  label: string;
  subtitle: string;
  onExpand?: () => void;
  isExpanded?: boolean;
  isExpanding?: boolean;
};

const ROOT_POSITION = { x: 120, y: 360 };
const NODE_COLUMN_GAP = 340;
const NODE_ROW_GAP = 170;

const knownTypes = new Set<GraphEntityType>([
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
]);

const organizationLabels = new Set(["Company", "Employee", "Department", "Team", "Project", "Repository", "Service", "Document", "Decision", "Incident", "Task", "PullRequest", "Channel", "Message"]);

export function organizationGraph(graph: GraphResponse): GraphResponse {
  const nodes = graph.nodes.filter((node) => node.properties.graphDomain !== "product-progress" && node.labels.some((label) => organizationLabels.has(label)));
  if (!nodes.some((node) => node.labels.includes("Company"))) return { nodes: [], edges: [] };
  const nodeIds = new Set(nodes.map((node) => node.id));
  return { nodes, edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)) };
}

export function entityTypeOf(entity: Entity): GraphEntityType | "Unknown" {
  return entity.entityType && knownTypes.has(entity.entityType) ? entity.entityType : "Unknown";
}

export function graphEntity(node: GraphResponse["nodes"][number]): Entity {
  const entityType = node.labels.find((label): label is GraphEntityType => knownTypes.has(label as GraphEntityType)) ?? "Unknown";
  return entityType === "Unknown"
    ? { ...node.properties, id: node.id }
    : { ...node.properties, id: node.id, entityType };
}

export function normalizeGraph(graph: GraphResponse): {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
} {
  const rootId = graphRootId(graph);
  const visibleIds = initialVisibleIds(graph, rootId);
  return normalizeVisibleGraph(graph, visibleIds, [], rootId);
}

export function graphRootId(graph: GraphResponse): string | undefined {
  return graph.nodes.find((node) => node.labels.includes("Company"))?.id
    ?? graph.nodes.find((node) => node.labels.includes("Product"))?.id
    ?? graph.nodes[0]?.id;
}

export function graphNeighbors(graph: GraphResponse, id: string): Set<string> {
  const neighbors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === id) neighbors.add(edge.target);
    if (edge.target === id) neighbors.add(edge.source);
  }
  return neighbors;
}

export function initialVisibleIds(graph: GraphResponse, rootId = graphRootId(graph)): Set<string> {
  const visible = new Set<string>();
  if (!rootId) return visible;
  visible.add(rootId);
  return visible;
}

export function visibleIdsForExpanded(graph: GraphResponse, rootId: string | undefined, expandedIds: Set<string>): Set<string> {
  const visible = initialVisibleIds(graph, rootId);
  if (!rootId) return visible;
  const queue = [...expandedIds];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id) || !visible.has(id)) continue;
    visited.add(id);
    for (const neighbor of graphNeighbors(graph, id)) {
      visible.add(neighbor);
      if (expandedIds.has(neighbor)) queue.push(neighbor);
    }
  }
  return visible;
}

export function normalizeVisibleGraph(
  graph: GraphResponse,
  visibleIds: Set<string>,
  previousNodes: Node<GraphNodeData>[] = [],
  expansionOrigin?: string,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const rootId = graphRootId(graph);
  const previousPositions = new Map(previousNodes.map((node) => [node.id, node.position] as const));
  const occupied = [...previousPositions.values()];
  if (rootId && !previousPositions.has(rootId)) previousPositions.set(rootId, ROOT_POSITION);
  const origin = (expansionOrigin && previousPositions.get(expansionOrigin)) || (rootId ? previousPositions.get(rootId) : undefined) || ROOT_POSITION;
  const nodes = [...visibleIds].map((id) => {
    const record = byId.get(id);
    if (!record) return null;
    let position = previousPositions.get(id);
    if (!position) {
      position = nextExpansionPosition(origin, occupied);
      occupied.push(position);
      previousPositions.set(id, position);
    }
    return toGraphNode(graphEntity(record), position);
  }).filter((node): node is Node<GraphNodeData> => Boolean(node));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => {
      const sourcePosition = nodes.find((node) => node.id === edge.source)?.position ?? ROOT_POSITION;
      const targetPosition = nodes.find((node) => node.id === edge.target)?.position ?? ROOT_POSITION;
      const flowsRight = targetPosition.x >= sourcePosition.x;
      return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: flowsRight ? "source-right" : "source-left",
      targetHandle: flowsRight ? "target-left" : "target-right",
      type: "smoothstep",
      animated: false,
      data: { relationshipType: edge.type, properties: edge.properties },
    }; })
    .filter((edge) => {
      if (edgeIds.has(edge.id)) return false;
      edgeIds.add(edge.id);
      return true;
    });
  return { nodes, edges };
}

export function toGraphNode(
  entity: Entity,
  position: { x: number; y: number },
): Node<GraphNodeData> {
  const type = entityTypeOf(entity);
  const label = entity.name ?? entity.title ?? entity.id;
  const subtitle =
    type === "Employee"
      ? String(entity.jobTitle ?? "Employee")
      : type === "Project"
        ? String(entity.status ?? "Project")
        : type === "Department"
          ? `${String(entity.employeeCount ?? "—")} people`
          : ["Product", "ProductModule", "Feature", "FeatureRequest", "Ticket", "Bug", "Release", "Commit", "Activity", "Review"].includes(type)
            ? String(entity.status ?? entity.activityType ?? type)
            : type;
  return {
    id: entity.id,
    type: "entity",
    position,
    data: { entity, entityType: type, label, subtitle },
  };
}

export function normalizeNeighborhood(
  neighborhood: Neighborhood,
  origin: Entity,
  existingNodes: Node<GraphNodeData>[],
  originPosition = { x: 400, y: 300 },
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const existingIds = new Set(existingNodes.map((node) => node.id));
  const addedIds = new Set<string>();
  const entities = neighborhood.nodes.filter((entity) => {
    if (entity.id === origin.id || existingIds.has(entity.id) || addedIds.has(entity.id)) return false;
    addedIds.add(entity.id);
    return true;
  });
  const occupied = [...existingNodes.map((node) => node.position)];
  const nodes = entities.map((entity) => {
    const position = nextExpansionPosition(originPosition, occupied);
    occupied.push(position);
    return toGraphNode(entity, position);
  });
  const validIds = new Set([...existingIds, origin.id, ...nodes.map((node) => node.id)]);
  const positions = new Map([
    ...existingNodes.map((node) => [node.id, node.position] as const),
    [origin.id, originPosition] as const,
    ...nodes.map((node) => [node.id, node.position] as const),
  ]);
  const edgeIds = new Set<string>();
  const edges = neighborhood.edges
    .filter((edge) => validIds.has(edge.from) && validIds.has(edge.to))
    .map((edge) => {
      const sourcePosition = positions.get(edge.from) ?? originPosition;
      const targetPosition = positions.get(edge.to) ?? originPosition;
      const flowsLeft = sourcePosition.x > targetPosition.x;
      return {
        id: `${edge.from}:${edge.type}:${edge.to}`,
        source: edge.from,
        target: edge.to,
        sourceHandle: flowsLeft ? "source-left" : "source-right",
        targetHandle: flowsLeft ? "target-right" : "target-left",
        type: "smoothstep",
        animated: false,
        data: { direction: edge.direction ?? "unknown" },
      };
    })
    .filter((edge) => {
      if (edgeIds.has(edge.id)) return false;
      edgeIds.add(edge.id);
      return true;
    });
  return { nodes, edges };
}

export function nextExpansionPosition(
  origin: { x: number; y: number },
  occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const x = origin.x + NODE_COLUMN_GAP;
  for (let row = 0; ; row += 1) {
    const offset = row === 0 ? 0 : Math.ceil(row / 2) * (row % 2 === 1 ? 1 : -1);
    const position = { x, y: origin.y + offset * NODE_ROW_GAP };
    const collides = occupied.some(
      (point) => Math.abs(point.x - position.x) < 240 && Math.abs(point.y - position.y) < 125,
    );
    if (!collides) return position;
  }
}
