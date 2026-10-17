const productOnlyTypes = new Set([
  "Product",
  "ProductModule",
  "Feature",
  "FeatureRequest",
  "Ticket",
  "Bug",
  "Release",
  "PullRequest",
  "Commit",
  "Comment",
  "Activity",
  "Review",
  "Task",
]);

export function isProductGraphEntity(type: string, graphDomain?: unknown): boolean {
  if (typeof graphDomain === "string") return graphDomain === "product-progress";
  return productOnlyTypes.has(type);
}
