const baseGraph = require("../data/seed-graph.json");
const realisticGraph = require("../data/realistic-seed.json");
// Keep the supplied graph intact and layer a larger, coherent synthetic company dataset on top.
const graph = {
  nodes: [...(baseGraph.nodes || []), ...(realisticGraph.nodes || [])],
  edges: [...(baseGraph.edges || []), ...(realisticGraph.edges || [])],
  metadata: { synthetic: true, periodStart: "2023-01-09", periodEnd: "2026-10-01" }
};
const nodes = graph.nodes || [];
const edges = graph.edges || [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const props = (node) => node?.properties || {};
const label = (node) => node?.labels?.[0] || "Unknown";
const get = (node, ...keys) => {
  const p = props(node);
  for (const key of keys) if (p[key] !== undefined) return p[key];
  return undefined;
};
const records = (type) => nodes.filter((n) => n.labels?.includes(type));
const linked = (nodeId, relationship) => edges.filter((e) => e.source === nodeId && (!relationship || e.type === relationship)).map((e) => byId.get(e.target)).filter(Boolean);
const linkedFrom = (nodeId, relationship) => edges.filter((e) => e.target === nodeId && (!relationship || e.type === relationship)).map((e) => byId.get(e.source)).filter(Boolean);
function searchNodes(query, allowedLabels) {
  const q = String(query || "").trim().toLowerCase();
  return nodes.filter((n) => (!allowedLabels || allowedLabels.some((l) => n.labels?.includes(l))) && (!q || JSON.stringify({ id:n.id, labels:n.labels, properties:n.properties }).toLowerCase().includes(q)));
}
function person(id) {
  const n = byId.get(id);
  if (!n) return null;
  const p = props(n);
  return { id:n.id, name:p.name || p.displayName || id, email:p.email || null, username:p.username || p.githubLogin || p.slackId || id, title:p.jobTitle || null, team:p.teamName || null, department:p.departmentName || null, active:p.employmentStatus ? /active/i.test(p.employmentStatus) : true, githubLogin:p.githubLogin || null, slackId:p.slackId || id };
}
function page(node) {
  const p = props(node);
  return { id:node.id, title:p.title || p.name || node.id, type:"page", status:p.status || "current", body:{storage:{value:p.content || p.body || "",representation:"storage"}}, version:{number:p.version || 1}, space:{key:p.spaceKey || "ENG",name:p.spaceName || "Engineering"}, authorId:p.authorId, author:person(p.authorId), projectId:p.projectId, labels:p.labels || [], url:p.externalUrl || null, createdAt:p.createdAt, updatedAt:p.updatedAt, source:"seed" };
}
function issue(node) {
  const p = props(node);
  return { id:node.id, key:p.key || node.id.toUpperCase(), summary:p.title || p.summary || p.name || node.id, description:p.description || "", status:{name:p.status || "To Do",statusCategory:{key:/done|merged|resolved|released|completed/i.test(p.status || "") ? "done" : /progress|review/i.test(p.status || "") ? "indeterminate" : "new"}}, priority:{name:p.priority || "P2"}, issuetype:{name:p.issuetype || label(node)}, assignee:p.assigneeId ? {accountId:p.assigneeId,displayName:props(byId.get(p.assigneeId)).name || p.assigneeId} : null, reporter:(p.reporterId || p.authorId) ? {accountId:p.reporterId || p.authorId,displayName:props(byId.get(p.reporterId || p.authorId)).name || p.reporterId || p.authorId} : null, project:{key:p.projectKey || "ORB",name:p.projectName || "Orbit Checkout"}, sprint:p.sprint || null, storyPoints:p.storyPoints ?? null, labels:p.labels || [], components:p.components || [], created:p.createdAt || null, updated:p.updatedAt || null, resolutiondate:p.resolvedAt || p.mergedAt || null, fixVersion:p.fixVersion || null, url:p.externalUrl || null, rawSeedId:node.id };
}
function repository(node) {
  const p = props(node);
  const prs = records("PullRequest").filter((pr) => props(pr).repositoryId === node.id);
  const commits = records("Commit").filter((c) => props(c).repositoryId === node.id);
  const ghIssues = records("GitHubIssue").filter((i) => props(i).repositoryId === node.id);
  const branches = [...new Set(["main", ...prs.map((pr) => props(pr).headRef).filter(Boolean)])];
  return { id:node.id, name:p.name || node.id, full_name:p.fullName || `${p.owner || "acme-platform"}/${p.name || node.id}`, owner:{login:p.owner || "acme-platform"}, private:p.visibility !== "public", visibility:p.visibility || "private", description:p.description || `Seed repository for ${p.name || node.id}`, language:p.language || null, html_url:p.externalUrl || null, default_branch:p.defaultBranch || "main", open_issues_count:ghIssues.filter(i => props(i).state === "open").length, pulls_count:prs.length, commits_count:commits.length, branches_count:branches.length, created_at:p.createdAt || null, updated_at:p.updatedAt || null, source:"synthetic-seed" };
}
function slackMessage(node) {
  const p = props(node); const u = person(p.authorId || p.userId || p.actorId);
  const channelNode = byId.get(p.channelId); const cp = props(channelNode);
  return { type:"message", ts:p.occurredAt || p.createdAt || node.id, user:u?.slackId || p.authorId || p.actorId || "seed-bot", username:u?.username || "seed-bot", user_profile:u, text:p.text || p.message || p.body || p.title || "", channel:p.channelName || cp.name || p.channelId || "general", channel_id:p.channelId || null, thread_ts:p.threadTs || null, reply_count:p.threadReplyCount || 0, permalink:p.externalUrl || null, linkedJiraKey:p.linkedJiraKey || null, seedId:node.id };
}
module.exports = { graph,nodes,edges,byId,props,label,get,records,linked,linkedFrom,searchNodes,page,issue,repository,slackMessage,person };