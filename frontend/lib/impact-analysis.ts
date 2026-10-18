import type { GraphApiEdge, GraphApiNode, GraphResponse } from "@/lib/types";

export type ImpactEntity = GraphApiNode & { entityType: string };
export type DecisionImpact = {
  decision: ImpactEntity;
  edges: GraphApiEdge[];
  entities: ImpactEntity[];
  owner: ImpactEntity | null;
  date: string | null;
};

const outcomeStatuses = new Set(["accepted", "approved", "implemented", "rejected", "declined", "resolved", "closed", "done", "released"]);
const unresolvedStatuses = new Set(["open", "pending", "proposed", "draft", "unresolved", "in-progress", "todo"]);

export function combineImpactGraphs(responses: GraphResponse[]): GraphResponse {
  return {
    nodes: [...new Map(responses.flatMap((graph) => graph.nodes).map((node) => [node.id, node])).values()],
    edges: [...new Map(responses.flatMap((graph) => graph.edges).map((edge) => [edge.id, edge])).values()],
  };
}

export function getImpactDecisions(graph: GraphResponse): DecisionImpact[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.filter((node) => node.labels.includes("Decision")).map((decision) => {
    const edges = graph.edges.filter((edge) => edge.source === decision.id || edge.target === decision.id);
    const entities = [...new Map(edges.map((edge) => nodeById.get(edge.source === decision.id ? edge.target : edge.source)).filter((node): node is GraphApiNode => Boolean(node)).map((node) => [node.id, { ...node, entityType: node.labels[0] ?? "Unknown" }])).values()];
    const owner = entities.find((entity) => entity.labels.includes("Employee") && edges.some((edge) => edge.type === "MADE_DECISION" && edge.source === entity.id)) ?? null;
    const date = [decision.properties.validFrom, decision.properties.createdAt, decision.properties.updatedAt].find((value): value is string => typeof value === "string") ?? null;
    return { decision: { ...decision, entityType: "Decision" }, edges, entities, owner, date };
  });
}

export function decisionMetrics(decisions: DecisionImpact[]) {
  const affected = new Set(decisions.flatMap((item) => item.entities.map((entity) => entity.id)));
  const withOutcome = decisions.filter((item) => outcomeStatuses.has(String(item.decision.properties.status ?? "").toLowerCase()));
  const unresolved = decisions.filter((item) => {
    const status = String(item.decision.properties.status ?? "").toLowerCase();
    return !status || unresolvedStatuses.has(status);
  });
  return { total: decisions.length, withOutcome: withOutcome.length, unresolved: unresolved.length, affectedEntities: affected.size };
}

export function entityLabel(entity: ImpactEntity): string {
  const value = entity.properties.name ?? entity.properties.title ?? entity.properties.displayName ?? entity.id;
  return typeof value === "string" ? value : entity.id;
}

export function relationshipSummary(edge: GraphApiEdge, source: ImpactEntity, target: ImpactEntity): string {
  return `${entityLabel(source)} ${edge.type.replaceAll("_", " ").toLowerCase()} ${entityLabel(target)}`;
}
