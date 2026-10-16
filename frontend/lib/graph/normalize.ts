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
  hasChildren?: boolean;
};

const ROOT_POSITION = { x: 120, y: 360 };
const NODE_COLUMN_GAP = 360;
const NODE_ROW_GAP = 140;
const BRANCH_GAP = 35;

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

const organizationLabels = new Set([
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

export function organizationGraph(graph: GraphResponse): GraphResponse {
  const nodes = graph.nodes.filter(
    (node) =>
      node.properties.graphDomain !== "product-progress" &&
      node.labels.some((label) => organizationLabels.has(label)),
  );
  if (!nodes.some((node) => node.labels.includes("Company"))) return { nodes: [], edges: [] };
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

export function entityTypeOf(entity: Entity): GraphEntityType | "Unknown" {
  return entity.entityType && knownTypes.has(entity.entityType) ? entity.entityType : "Unknown";
}

export function graphEntity(node: GraphResponse["nodes"][number]): Entity {
  const entityType =
    node.labels.find((label): label is GraphEntityType => knownTypes.has(label as GraphEntityType)) ??
    "Unknown";
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
  return (
    graph.nodes.find((node) => node.labels.includes("Company"))?.id ??
    graph.nodes.find((node) => node.labels.includes("Product"))?.id ??
    graph.nodes[0]?.id
  );
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

/**
 * Returns the valid child IDs for a node following strict downward hierarchy:
 * Organization (Company) -> Department -> Employee (leaf node).
 * Also supports Department -> Team -> Employee when teams are present,
 * and Product -> ProductModule -> Feature -> Ticket -> PR for product progress.
 * Leaf nodes (like Employee) have no children and return [].
 */
export function getChildNodeIds(graph: GraphResponse, parentId: string): string[] {
  const parentNode = graph.nodes.find((n) => n.id === parentId);
  if (!parentNode) return [];

  const entity = graphEntity(parentNode);
  const type = entityTypeOf(entity);

  // Terminal nodes have no logical children in the hierarchy
  if (type === "Employee") return [];
  if (["PullRequest", "Release", "Commit", "Review", "Activity", "Comment"].includes(type)) return [];

  const children: string[] = [];
  const added = new Set<string>();

  const addChild = (id: string) => {
    if (id !== parentId && !added.has(id)) {
      added.add(id);
      children.push(id);
    }
  };

  if (type === "Company") {
    // Company -> Department
    for (const edge of graph.edges) {
      if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.includes("Department")) {
          addChild(targetNode.id);
        }
      } else if (edge.target === parentId) {
        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
        if (sourceNode?.labels.includes("Department")) {
          addChild(sourceNode.id);
        }
      }
    }
    // Fallback if no explicit edges connect Company and Department
    if (children.length === 0) {
      for (const node of graph.nodes) {
        if (node.labels.includes("Department")) {
          addChild(node.id);
        }
      }
    }
  } else if (type === "Department") {
    // Department -> Employee (direct)
    for (const edge of graph.edges) {
      if (edge.target === parentId) {
        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
        if (sourceNode?.labels.includes("Employee")) {
          addChild(sourceNode.id);
        }
      } else if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.includes("Employee")) {
          addChild(targetNode.id);
        }
      }
    }
    for (const node of graph.nodes) {
      if (node.labels.includes("Employee") && node.properties?.departmentId === parentId) {
        addChild(node.id);
      }
    }
    // If no direct employees found, check for Team children (intermediate level)
    if (children.length === 0) {
      for (const edge of graph.edges) {
        if (edge.source === parentId) {
          const targetNode = graph.nodes.find((n) => n.id === edge.target);
          if (targetNode?.labels.includes("Team")) {
            addChild(targetNode.id);
          }
        } else if (edge.target === parentId) {
          const sourceNode = graph.nodes.find((n) => n.id === edge.source);
          if (sourceNode?.labels.includes("Team")) {
            addChild(sourceNode.id);
          }
        }
      }
    }
  } else if (type === "Team") {
    // Team -> Employee
    for (const edge of graph.edges) {
      if (edge.target === parentId) {
        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
        if (sourceNode?.labels.includes("Employee")) {
          addChild(sourceNode.id);
        }
      } else if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.includes("Employee")) {
          addChild(targetNode.id);
        }
      }
    }
    for (const node of graph.nodes) {
      if (node.labels.includes("Employee") && node.properties?.teamId === parentId) {
        addChild(node.id);
      }
    }
  } else if (type === "Product") {
    // Product -> ProductModule
    for (const edge of graph.edges) {
      if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.includes("ProductModule")) addChild(targetNode.id);
      }
    }
  } else if (type === "ProductModule") {
    // ProductModule -> Feature / FeatureRequest
    for (const edge of graph.edges) {
      if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.some((l) => ["Feature", "FeatureRequest"].includes(l))) {
          addChild(targetNode.id);
        }
      }
    }
  } else if (type === "Feature" || type === "FeatureRequest") {
    // Feature -> Ticket / Task / Bug
    for (const edge of graph.edges) {
      if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.some((l) => ["Ticket", "Task", "Bug"].includes(l))) {
          addChild(targetNode.id);
        }
      }
    }
  } else if (type === "Ticket" || type === "Task" || type === "Bug") {
    // Ticket -> PullRequest / Release / Commit
    for (const edge of graph.edges) {
      if (edge.source === parentId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.target);
        if (targetNode?.labels.some((l) => ["PullRequest", "Release", "Commit"].includes(l))) {
          addChild(targetNode.id);
        }
      }
    }
  }

  return children;
}

export function visibleIdsForExpanded(
  graph: GraphResponse,
  rootId: string | undefined,
  expandedIds: Set<string>,
): Set<string> {
  const visible = initialVisibleIds(graph, rootId);
  if (!rootId) return visible;

  const queue = [rootId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (expandedIds.has(currentId)) {
      const children = getChildNodeIds(graph, currentId);
      for (const childId of children) {
        visible.add(childId);
        // Descendants are only revealed if the child itself is expanded
        if (expandedIds.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  return visible;
}

export function normalizeVisibleGraph(
  graph: GraphResponse,
  visibleIds: Set<string>,
  _previousNodes: Node<GraphNodeData>[] = [],
  _expansionOrigin?: string,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const rootId = graphRootId(graph);

  const visibleNodes = [...visibleIds]
    .map((id) => byId.get(id))
    .filter((record): record is GraphResponse["nodes"][number] => Boolean(record));

  if (visibleNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Build parent-child relationships among visible nodes
  const visibleChildrenMap = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const id of visibleIds) {
    const validChildren = getChildNodeIds(graph, id).filter((childId) => visibleIds.has(childId));
    visibleChildrenMap.set(id, validChildren);
    for (const childId of validChildren) {
      if (!parentOf.has(childId)) {
        parentOf.set(childId, id);
      }
    }
  }

  // Identify tree roots: rootId if visible, else nodes without visible parent
  const primaryRoot = rootId && visibleIds.has(rootId) ? rootId : visibleNodes[0].id;
  const roots: string[] = [primaryRoot];
  for (const node of visibleNodes) {
    if (!parentOf.has(node.id) && node.id !== primaryRoot) {
      roots.push(node.id);
    }
  }

  // Compute subtree height for each node
  const heightCache = new Map<string, number>();
  function getSubtreeHeight(nodeId: string): number {
    if (heightCache.has(nodeId)) return heightCache.get(nodeId)!;
    const children = visibleChildrenMap.get(nodeId) ?? [];
    if (children.length === 0) {
      heightCache.set(nodeId, NODE_ROW_GAP);
      return NODE_ROW_GAP;
    }
    let total = 0;
    for (let i = 0; i < children.length; i++) {
      total += getSubtreeHeight(children[i]);
      if (i < children.length - 1) {
        const currentHasChildren = (visibleChildrenMap.get(children[i])?.length ?? 0) > 0;
        const nextHasChildren = (visibleChildrenMap.get(children[i + 1])?.length ?? 0) > 0;
        if (currentHasChildren || nextHasChildren) {
          total += BRANCH_GAP;
        }
      }
    }
    const result = Math.max(NODE_ROW_GAP, total);
    heightCache.set(nodeId, result);
    return result;
  }

  // Layout tree recursively
  const positions = new Map<string, { x: number; y: number }>();
  function layoutNode(nodeId: string, level: number, yStart: number): { yCenter: number; yEnd: number } {
    const x = ROOT_POSITION.x + level * NODE_COLUMN_GAP;
    const children = visibleChildrenMap.get(nodeId) ?? [];

    if (children.length === 0) {
      const yCenter = yStart + NODE_ROW_GAP / 2;
      positions.set(nodeId, { x, y: yCenter - 45 });
      return { yCenter, yEnd: yStart + NODE_ROW_GAP };
    }

    let currentY = yStart;
    const childCenters: number[] = [];

    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      const { yCenter, yEnd } = layoutNode(childId, level + 1, currentY);
      childCenters.push(yCenter);
      currentY = yEnd;
      if (i < children.length - 1) {
        const currentHasChildren = (visibleChildrenMap.get(childId)?.length ?? 0) > 0;
        const nextHasChildren = (visibleChildrenMap.get(children[i + 1])?.length ?? 0) > 0;
        if (currentHasChildren || nextHasChildren) {
          currentY += BRANCH_GAP;
        }
      }
    }

    const yCenter = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    positions.set(nodeId, { x, y: yCenter - 45 });
    return { yCenter, yEnd: currentY };
  }

  // Run layout for each root
  let treeY = 0;
  for (const root of roots) {
    const { yEnd } = layoutNode(root, 0, treeY);
    treeY = yEnd + BRANCH_GAP;
  }

  // Center primary root around ROOT_POSITION.y
  const primaryRootPos = positions.get(primaryRoot);
  if (primaryRootPos) {
    const deltaY = ROOT_POSITION.y - primaryRootPos.y;
    for (const [id, pos] of positions.entries()) {
      positions.set(id, { x: pos.x, y: pos.y + deltaY });
    }
  }

  // Construct React Flow nodes
  const nodes = visibleNodes.map((record) => {
    const position = positions.get(record.id) ?? ROOT_POSITION;
    const entity = graphEntity(record);
    const hasChildren = getChildNodeIds(graph, record.id).length > 0;
    return toGraphNode(entity, position, hasChildren);
  });

  // Construct React Flow edges: strictly parent -> child (left to right)
  const edgeIds = new Set<string>();
  const edges: Edge[] = [];

  for (const [childId, parentId] of parentOf.entries()) {
    if (!visibleIds.has(childId) || !visibleIds.has(parentId)) continue;

    // Find raw edge if available to preserve ID and properties
    const rawEdge = graph.edges.find(
      (e) =>
        (e.source === parentId && e.target === childId) ||
        (e.source === childId && e.target === parentId),
    );

    let edgeId = rawEdge?.id ?? `${parentId}:${childId}`;
    if (edgeIds.has(edgeId)) {
      edgeId = `${parentId}:${childId}:${edgeIds.size}`;
    }
    edgeIds.add(edgeId);

    edges.push({
      id: edgeId,
      source: parentId,
      target: childId,
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "default", // elegant smooth Bezier curve
      animated: false,
      data: {
        relationshipType: rawEdge?.type ?? "HIERARCHY",
        properties: rawEdge?.properties ?? {},
      },
    });
  }

  return { nodes, edges };
}

export function toGraphNode(
  entity: Entity,
  position: { x: number; y: number },
  hasChildren = false,
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
          : [
              "Product",
              "ProductModule",
              "Feature",
              "FeatureRequest",
              "Ticket",
              "Bug",
              "Release",
              "Commit",
              "Activity",
              "Review",
            ].includes(type)
            ? String(entity.status ?? entity.activityType ?? type)
            : type;
  return {
    id: entity.id,
    type: "entity",
    position,
    data: { entity, entityType: type, label, subtitle, hasChildren },
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
    return toGraphNode(entity, position, false);
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
        type: "default", // soft, smooth Bezier curves
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
