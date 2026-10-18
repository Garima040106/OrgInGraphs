export type DemoTicket = {
  key: string; title: string; status: "To Do" | "In Progress" | "Done";
  priority: "Low" | "Medium" | "High" | "Critical"; assignee: string;
  project: string; updatedAt: string; excerpt: string;
};

export type DemoConversation = {
  id: string; channel: string; author: string; message: string;
  timestamp: string; replies: number;
};

// Synthetic examples for the UI only. These fixtures are never sent to an API or index.
export const DEMO_TICKETS: DemoTicket[] = [
  { key: "HIR-101", title: "Implement user authentication", status: "In Progress", priority: "High", assignee: "Mia Chen", project: "Identity", updatedAt: "2026-10-16", excerpt: "Add session handling and sign-in validation for the organization portal." },
  { key: "HIR-102", title: "Fix payment retry handling", status: "To Do", priority: "Critical", assignee: "Liam Johnson", project: "Payments", updatedAt: "2026-10-15", excerpt: "Make retry behavior safe when a payment provider returns a temporary error." },
  { key: "HIR-103", title: "Improve dashboard loading performance", status: "In Progress", priority: "High", assignee: "Noah Williams", project: "Web Experience", updatedAt: "2026-10-14", excerpt: "Reduce the time needed to render the first dashboard view." },
  { key: "HIR-104", title: "Add API rate limiting", status: "To Do", priority: "Medium", assignee: "Sofia Garcia", project: "Platform", updatedAt: "2026-10-13", excerpt: "Apply configurable request limits to public API endpoints." },
  { key: "HIR-105", title: "Investigate notification delivery failures", status: "In Progress", priority: "High", assignee: "Ethan Brown", project: "Messaging", updatedAt: "2026-10-12", excerpt: "Review delivery logs and identify causes of delayed notifications." },
  { key: "HIR-106", title: "Update organization permissions", status: "Done", priority: "Medium", assignee: "Ava Patel", project: "Identity", updatedAt: "2026-10-11", excerpt: "Clarify role permissions for organization administrators." },
  { key: "HIR-107", title: "Optimize database queries", status: "In Progress", priority: "High", assignee: "Oliver Smith", project: "Data Platform", updatedAt: "2026-10-10", excerpt: "Profile slow list queries and add focused indexes where appropriate." },
  { key: "HIR-108", title: "Add integration health monitoring", status: "To Do", priority: "Medium", assignee: "Isabella Brown", project: "Platform", updatedAt: "2026-10-09", excerpt: "Expose health signals for connected services in the admin view." },
  { key: "HIR-109", title: "Improve checkout error messages", status: "Done", priority: "Low", assignee: "William Young", project: "Web Experience", updatedAt: "2026-10-08", excerpt: "Show clear next steps when checkout cannot be completed." },
  { key: "HIR-110", title: "Add audit events for role changes", status: "To Do", priority: "Medium", assignee: "Mia Chen", project: "Identity", updatedAt: "2026-10-07", excerpt: "Record organization role changes in the audit history." },
  { key: "HIR-111", title: "Review webhook retry policy", status: "In Progress", priority: "High", assignee: "Liam Johnson", project: "Payments", updatedAt: "2026-10-06", excerpt: "Document and test webhook retry limits and backoff behavior." },
  { key: "HIR-112", title: "Refresh mobile navigation", status: "To Do", priority: "Low", assignee: "Sofia Garcia", project: "Mobile", updatedAt: "2026-10-05", excerpt: "Align the mobile navigation with the latest product structure." },
  { key: "HIR-113", title: "Add service latency alert", status: "Done", priority: "Critical", assignee: "Ethan Brown", project: "Reliability", updatedAt: "2026-10-04", excerpt: "Notify the on-call team when service latency crosses its target." },
  { key: "HIR-114", title: "Document account recovery flow", status: "In Progress", priority: "Low", assignee: "Ava Patel", project: "Identity", updatedAt: "2026-10-03", excerpt: "Describe account recovery behavior and customer support steps." },
  { key: "HIR-115", title: "Add product usage summary", status: "To Do", priority: "Medium", assignee: "Noah Williams", project: "Analytics", updatedAt: "2026-10-02", excerpt: "Provide a concise usage summary for workspace administrators." },
  { key: "HIR-116", title: "Harden integration secret storage", status: "In Progress", priority: "Critical", assignee: "Oliver Smith", project: "Security", updatedAt: "2026-10-01", excerpt: "Review secret handling and rotation behavior for integrations." },
];

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  { id: "demo-slack-1", channel: "#engineering", author: "Mia Chen", message: "The latest API deployment is live in staging. I am checking the health checks before we share the rollout notes.", timestamp: "Today, 10:42 AM", replies: 4 },
  { id: "demo-slack-2", channel: "#payments", author: "Liam Johnson", message: "I can reproduce the intermittent retry issue when the provider times out. I will add the response trace to the ticket.", timestamp: "Today, 9:18 AM", replies: 6 },
  { id: "demo-slack-3", channel: "#product", author: "Noah Williams", message: "The dashboard release review is ready. Please leave feedback on the loading state and the updated summary cards.", timestamp: "Yesterday, 4:36 PM", replies: 3 },
  { id: "demo-slack-4", channel: "#platform", author: "Sofia Garcia", message: "For integration monitoring, the first pass should include freshness and last successful sync time.", timestamp: "Yesterday, 2:05 PM", replies: 2 },
  { id: "demo-slack-5", channel: "#engineering", author: "Oliver Smith", message: "The query profile points to the activity list. I am testing a narrower index before changing the endpoint.", timestamp: "Yesterday, 11:21 AM", replies: 5 },
  { id: "demo-slack-6", channel: "#support", author: "Ethan Brown", message: "We are following up on delayed notification delivery and will post an update after reviewing the queue metrics.", timestamp: "Mon, 3:50 PM", replies: 1 },
  { id: "demo-slack-7", channel: "#security", author: "Ava Patel", message: "The permissions review is complete. The proposed role changes are documented for the next review.", timestamp: "Mon, 1:12 PM", replies: 2 },
  { id: "demo-slack-8", channel: "#web", author: "William Young", message: "The checkout copy update is ready for a quick review. Error states now include a clear recovery step.", timestamp: "Fri, 4:24 PM", replies: 0 },
  { id: "demo-slack-9", channel: "#payments", author: "Isabella Brown", message: "Webhook backoff notes are in progress. I am covering duplicate delivery and the maximum retry window.", timestamp: "Fri, 11:03 AM", replies: 3 },
  { id: "demo-slack-10", channel: "#platform", author: "Mia Chen", message: "The service latency alert draft is ready. Could someone confirm the proposed threshold with the on-call team?", timestamp: "Thu, 2:17 PM", replies: 2 },
];

export function filterDemoTickets(query: string, status = "All statuses", priority = "All priorities") {
  const term = query.trim().toLocaleLowerCase();
  return DEMO_TICKETS.filter((item) =>
    (!term || Object.values(item).join(" ").toLocaleLowerCase().includes(term)) &&
    (status === "All statuses" || item.status === status) &&
    (priority === "All priorities" || item.priority === priority),
  );
}

export function filterDemoConversations(query: string) {
  const term = query.trim().toLocaleLowerCase();
  return DEMO_CONVERSATIONS.filter((item) => !term || [item.message, item.author, item.channel].join(" ").toLocaleLowerCase().includes(term));
}

export type DemoSyncSource = {
  id: "jira" | "slack"; name: string; image: string;
  status: "Not run" | "Completed" | "Running" | "Failed";
};

export const DEMO_SYNC_SOURCES: DemoSyncSource[] = [
  { id: "jira", name: "Jira", image: "/img/jira.webp", status: "Not run" },
  { id: "slack", name: "Slack", image: "/img/slack.png", status: "Not run" },
];

export const DEMO_SYNC_ACTIVITY: Array<{ source: string; detail: string; when: string; status: "Completed" | "Running" | "Failed" }> = [];
