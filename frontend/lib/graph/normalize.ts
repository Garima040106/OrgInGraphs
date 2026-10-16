import type { Edge, Node } from "@xyflow/react";
import type { Entity, EntityType, GraphResponse, Neighborhood } from "@/lib/types";

export type GraphNodeData = {
  entity: Entity;
  entityType: EntityType | "Unknown";
  label: string;
  subtitle: string;
  onExpand?: () => void;
  isExpanded?: boolean;
  isExpanding?: boolean;
};

const NODE_COLUMN_GAP = 300;
const NODE_ROW_GAP = 150;

const knownTypes = new Set<EntityType>([
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
]);

export function entityTypeOf(entity: Entity): EntityType | "Unknown" {
  return entity.entityType && knownTypes.has(entity.entityType) ? entity.entityType : "Unknown";
}

export function graphEntity(node: GraphResponse["nodes"][number]): Entity {
  const entityType = node.labels.find((label): label is EntityType => knownTypes.has(label as EntityType)) ?? "Unknown";
  return entityType === "Unknown"
    ? { ...node.properties, id: node.id }
    : { ...node.properties, id: node.id, entityType };
}

export function normalizeGraph(graph: GraphResponse): {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
} {
  const company = graph.nodes.find((node) => node.labels.includes("Company"));
  const startingNodes = company ? [company] : graph.nodes.slice(0, 1);
  const nodes = startingNodes.map((node) => toGraphNode(graphEntity(node), { x: 900, y: 360 }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: false,
      data: { relationshipType: edge.type, properties: edge.properties },
    }));
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

function nextExpansionPosition(
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
