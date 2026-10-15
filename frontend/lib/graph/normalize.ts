import type { Edge, Node } from "@xyflow/react";
import type { Entity, EntityType, Neighborhood } from "@/lib/types";

export type GraphNodeData = {
  entity: Entity;
  entityType: EntityType | "Unknown";
  label: string;
  subtitle: string;
};

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
  existingIds: Set<string>,
  currentCount: number,
  originPosition = { x: 400, y: 300 },
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const angleStep = (Math.PI * 2) / Math.max(neighborhood.nodes.length, 1);
  const nodes = neighborhood.nodes
    .filter((entity) => entity.id !== origin.id && !existingIds.has(entity.id))
    .map((entity) => {
      const originalIndex = neighborhood.nodes.findIndex((item) => item.id === entity.id);
      const angle = originalIndex * angleStep;
      const radius = 270 + (currentCount % 3) * 30;
      return toGraphNode(entity, {
        x: originPosition.x + Math.round(Math.cos(angle) * radius),
        y: originPosition.y + Math.round(Math.sin(angle) * radius),
      });
    });
  const validIds = new Set([...existingIds, origin.id, ...nodes.map((node) => node.id)]);
  const edges = neighborhood.edges
    .filter((edge) => validIds.has(edge.from) && validIds.has(edge.to))
    .map((edge) => ({
      id: `${edge.from}:${edge.type}:${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.type.replaceAll("_", " ").toLowerCase(),
      type: "smoothstep",
      animated: false,
      data: { direction: edge.direction ?? "unknown" },
    }));
  return { nodes, edges };
}
