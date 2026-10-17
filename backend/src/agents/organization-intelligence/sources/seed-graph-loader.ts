import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscoveredSource } from '../types.js';

type GraphNode = { id: string; labels?: string[]; properties?: Record<string, unknown> };
type GraphEdge = { source: string; target: string; type: string; properties?: Record<string, unknown> };
type GraphSnapshot = { nodes?: GraphNode[]; edges?: GraphEdge[] };

const seedDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../rag-seeds');
const printable = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(printable).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function snapshotSources(fileName: string, snapshot: GraphSnapshot): DiscoveredSource[] {
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const aliases = new Map<string, GraphNode>();
  for (const node of nodes) {
    aliases.set(node.id, node);
    for (const key of ['id', 'username', 'email', 'sourceRecordId']) {
      const alias = node.properties?.[key];
      if (typeof alias === 'string') aliases.set(alias, node);
    }
  }
  const nodeName = (id: string) => {
    const node = aliases.get(id);
    const properties = node?.properties ?? {};
    return String(properties.name ?? properties.displayName ?? properties.title ?? properties.summary ?? id);
  };

  const sources: DiscoveredSource[] = nodes.filter((node) => typeof node.id === 'string').map((node) => {
    const properties = node.properties ?? {};
    const type = node.labels?.[0] ?? 'Entity';
    const name = nodeName(node.id);
    const propertyLines = Object.entries(properties)
      .filter(([key, value]) => key !== 'id' && value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${printable(value)}`);
    const relations = edges.flatMap((edge) => {
      if (edge.source !== node.id && edge.target !== node.id) return [];
      const outgoing = edge.source === node.id;
      const otherId = outgoing ? edge.target : edge.source;
      const detail = Object.entries(edge.properties ?? {}).map(([key, value]) => `${key}=${printable(value)}`).join(', ');
      return [`${outgoing ? 'Outgoing' : 'Incoming'} ${edge.type}: ${nodeName(otherId)} (id: ${otherId})${detail ? `; ${detail}` : ''}`];
    });
    const content = [
      `Entity: ${name}`,
      `Type: ${type}`,
      `ID: ${node.id}`,
      ...propertyLines,
      ...(relations.length ? ['Relationships:', ...relations] : [])
    ].join('\n');
    const sourcePath = `seed-graphs/${fileName}/${type}/${encodeURIComponent(node.id)}`;
    return {
      id: `seed:${fileName}:${node.id}`,
      type: 'documentation' as const,
      path: sourcePath,
      title: `${type}: ${name}`,
      content,
      metadata: { entityType: type, entityId: node.id, sourceSystem: 'seed-graph', graphFile: fileName },
      hash: createHash('sha256').update(content).digest('hex')
    };
  });
  const counts = new Map<string, string[]>();
  for (const node of nodes) {
    const type = node.labels?.[0] ?? 'Entity';
    const names = counts.get(type) ?? [];
    names.push(nodeName(node.id));
    counts.set(type, names);
  }
  const summaryLines = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, names]) =>
    `${type} count: ${names.length}. ${type === 'Department' ? `There are ${names.length} departments: ` : ''}${names.slice(0, 100).join(', ')}`
  );
  const summary = [`Seed graph ${fileName} contains ${nodes.length} entities and ${edges.length} relationships.`, ...summaryLines].join('\n');
  sources.push({
    id: `seed-summary:${fileName}`,
    type: 'documentation',
    path: `seed-graphs/${fileName}/summary`,
    title: `Organization graph summary: ${fileName}`,
    content: summary,
    metadata: { sourceSystem: 'seed-graph', graphSummary: true, graphFile: fileName },
    hash: createHash('sha256').update(summary).digest('hex')
  });

  const people = nodes.filter((node) => node.labels?.includes('Employee'));
  const peopleByAlias = new Set<string>();
  for (const person of people) {
    peopleByAlias.add(person.id);
    for (const key of ['id', 'username', 'email', 'sourceRecordId']) {
      if (typeof person.properties?.[key] === 'string') peopleByAlias.add(String(person.properties[key]));
    }
  }
  const teams = nodes.filter((node) => node.labels?.includes('Team'));
  if (teams.length) {
    const teamLines = teams.map((team) => {
      const properties = team.properties ?? {};
      const leadId = String(properties.leadId ?? '');
      const lead = leadId && peopleByAlias.has(leadId) ? nodeName(leadId) : '';
      const memberIds = new Set<string>(Array.isArray(properties.memberIds) ? properties.memberIds.map(String) : []);
      for (const edge of edges) {
        if ((edge.type === 'MEMBER_OF' || edge.type === 'HAS_MEMBER') && edge.target === team.id) memberIds.add(edge.source);
        if ((edge.type === 'HAS_MEMBER' || edge.type === 'MEMBER_OF') && edge.source === team.id) memberIds.add(edge.target);
      }
      const memberNames = [...new Set([...memberIds].map((id) => peopleByAlias.has(id) ? nodeName(id) : '').filter(Boolean))];
      const department = String(properties.departmentName ?? (properties.departmentId ? nodeName(String(properties.departmentId)) : ''));
      const ownership = edges.flatMap((edge) => {
        if (!['OWNS', 'OWNED_BY', 'LEADS'].includes(edge.type)) return [];
        const other = edge.source === team.id ? edge.target : edge.target === team.id ? edge.source : '';
        return other ? [`${edge.type}: ${nodeName(other)}`] : [];
      });
      const responsibilities = edges.flatMap((edge) => {
        if (!['MAINTAINS', 'WORKS_ON', 'OWNS', 'ASSIGNED_TO'].includes(edge.type)) return [];
        const other = edge.source === team.id ? edge.target : edge.target === team.id ? edge.source : '';
        return other ? [`${edge.type}: ${nodeName(other)}`] : [];
      });
      const leadFact = lead ? `; Recorded team lead: ${lead}; Explicit owner: not specified` : '; Recorded team lead: not specified; Explicit owner: not specified';
      return `Team: ${nodeName(team.id)}${department ? `; Department: ${department}` : ''}${leadFact}${ownership.length ? `; Ownership relationships: ${ownership.join(', ')}` : ''}${responsibilities.length ? `; Area of work: ${responsibilities.join(', ')}` : ''}${memberNames.length ? `; Members (${memberNames.length}): ${memberNames.join(', ')}` : memberIds.size ? `; Member IDs (${memberIds.size}): ${[...memberIds].join(', ')}` : ''}`;
    });
    const teamContent = [`Teams and their recorded leads, ownership relationships, and members in ${fileName}:`, ...teamLines].join('\n');
    sources.push({
      id: `seed-teams:${fileName}`, type: 'documentation', path: `seed-graphs/${fileName}/teams`,
      title: `Team ownership and membership: ${fileName}`, content: teamContent,
      metadata: { sourceSystem: 'seed-graph', graphSummary: true, summaryKind: 'teams', graphFile: fileName },
      hash: createHash('sha256').update(teamContent).digest('hex')
    });
  }

  const products = nodes.filter((node) => node.labels?.includes('Product'))
    .sort((a, b) => String(b.properties?.updatedAt ?? '').localeCompare(String(a.properties?.updatedAt ?? '')));
  if (products.length) {
    const productLines = products.map((product) => {
      const properties = product.properties ?? {};
      const related = edges.filter((edge) => edge.source === product.id || edge.target === product.id)
        .map((edge) => `${edge.type}: ${nodeName(edge.source === product.id ? edge.target : edge.source)}`);
      return `Product: ${nodeName(product.id)}; Status: ${printable(properties.status) || 'not recorded'}; Last updated: ${printable(properties.updatedAt) || 'not recorded'}; Description: ${printable(properties.description) || 'not recorded'}${related.length ? `; Related work: ${related.join(', ')}` : ''}`;
    });
    const productContent = [`Hirenova product records in ${fileName}. Dates are stored update timestamps; products are ordered newest first.`, ...productLines].join('\n');
    sources.push({
      id: `seed-products:${fileName}`, type: 'documentation', path: `seed-graphs/${fileName}/products`,
      title: `Product records and update dates: ${fileName}`, content: productContent,
      metadata: { sourceSystem: 'seed-graph', graphSummary: true, summaryKind: 'products', graphFile: fileName },
      hash: createHash('sha256').update(productContent).digest('hex')
    });
  }
  return sources;
}

export function loadSeedGraphSources(directory = seedDirectory): DiscoveredSource[] {
  if (!existsSync(directory)) return [];
  const sources: DiscoveredSource[] = [];
  const snapshots: Array<{ fileName: string; snapshot: GraphSnapshot }> = [];
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    const snapshot = JSON.parse(readFileSync(path.join(directory, fileName), 'utf8')) as GraphSnapshot;
    snapshots.push({ fileName, snapshot });
    sources.push(...snapshotSources(fileName, snapshot));
  }
  sources.push(...derivedFactSources(snapshots));
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith('.js')).sort()) {
    const content = readFileSync(path.join(directory, fileName), 'utf8');
    sources.push({
      id: `seed-script:${fileName}`,
      type: 'documentation',
      path: `seed-graphs/${fileName}`,
      title: `Seed graph helper: ${fileName}`,
      content,
      metadata: { sourceSystem: 'seed-graph-script' },
      hash: createHash('sha256').update(content).digest('hex')
    });
  }
  return sources;
}

function derivedFactSources(snapshots: Array<{ fileName: string; snapshot: GraphSnapshot }>): DiscoveredSource[] {
  const now = new Date().toISOString();
  const makeSource = (id: string, kind: string, title: string, content: string): DiscoveredSource => ({
    id: `seed-derived:${id}`, type: 'documentation', path: `seed-graphs/derived/${id}`, title, content,
    metadata: { sourceSystem: 'seed-graph-derived', graphSummary: true, summaryKind: kind },
    hash: createHash('sha256').update(content).update(now.slice(0, 10)).digest('hex')
  });
  const departmentsBySnapshot: string[] = [];
  const headcountBySnapshot: string[] = [];
  const pullRequests = new Map<string, Set<string>>();
  const employees: Array<{ fileName: string; node: GraphNode }> = [];
  const teams: Array<{ fileName: string; node: GraphNode }> = [];

  for (const { fileName, snapshot } of snapshots) {
    const nodes = snapshot.nodes ?? [];
    const edges = snapshot.edges ?? [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const prs = nodes.filter((node) => node.labels?.includes('PullRequest'));
    for (const pr of prs) {
      const sourceFiles = pullRequests.get(pr.id) ?? new Set<string>();
      sourceFiles.add(fileName);
      pullRequests.set(pr.id, sourceFiles);
    }
    employees.push(...nodes.filter((node) => node.labels?.includes('Employee')).map((node) => ({ fileName, node })));
    teams.push(...nodes.filter((node) => node.labels?.includes('Team')).map((node) => ({ fileName, node })));

    const departments = nodes.filter((node) => node.labels?.includes('Department'));
    if (departments.length) {
      departmentsBySnapshot.push(`${fileName}: ${departments.length} departments (${departments.map((department) => nodeNameFor(department)).join(', ')}).`);
      const counts = departments.map((department) => {
        const count = nodes.filter((employee) => employee.labels?.includes('Employee') && (
          employee.properties?.departmentId === department.id ||
          edges.some((edge) => edge.type === 'WORKS_IN' && edge.source === employee.id && edge.target === department.id)
        )).length;
        return { name: nodeNameFor(department), count };
      });
      const max = Math.max(...counts.map((entry) => entry.count));
      const leaders = counts.filter((entry) => entry.count === max).map((entry) => `${entry.name} (${entry.count})`);
      headcountBySnapshot.push(`${fileName}: ${counts.map((entry) => `${entry.name}=${entry.count}`).join('; ')}. Highest headcount: ${leaders.join(', ')}.`);
    }
    if (fileName === 'realistic-organization.json') {
      const counts = new Map<string, number>();
      for (const employee of nodes.filter((node) => node.labels?.includes('Employee'))) {
        const department = String(employee.properties?.departmentName ?? 'Not specified');
        counts.set(department, (counts.get(department) ?? 0) + 1);
      }
      if (counts.size) {
        const max = Math.max(...counts.values());
        const leaders = [...counts.entries()].filter(([, count]) => count === max).map(([name, count]) => `${name} (${count})`);
        headcountBySnapshot.push(`${fileName}: ${[...counts.entries()].map(([name, count]) => `${name}=${count}`).join('; ')}. Highest headcount: ${leaders.join(', ')}.`);
      }
    }
  }

  const outputs: DiscoveredSource[] = [];
  const prLines = [`Unique PullRequest nodes across all supplied graph snapshots: ${pullRequests.size}. Counted by unique node ID; repeated node IDs across snapshots count once.`,
    ...[...pullRequests.entries()].map(([id, files]) => `${id} (present in ${[...files].join(', ')})`)
  ];
  outputs.push(makeSource('pull-request-count', 'pull-request-count', 'Pull request count across Hirenova graph data', prLines.join('\n')));
  outputs.push(makeSource('department-count', 'department-count', 'Department count and names by graph snapshot', departmentsBySnapshot.join('\n')));
  outputs.push(makeSource('department-headcount', 'department-headcount', 'Employee headcount by department and snapshot', ['Department employee headcount by source snapshot:', ...headcountBySnapshot].join('\n')));

  const frontendPeople = employees.filter(({ node }) => /front.?end/i.test(String(node.properties?.jobTitle ?? '')));
  const frontendTeam = teams.find(({ node }) => String(node.properties?.slug ?? '').toLowerCase() === 'web') ??
    teams.find(({ node }) => String(node.properties?.name ?? '').toLowerCase() === 'web team');
  const frontendTeamProps = frontendTeam?.node.properties ?? {};
  const leadId = String(frontendTeamProps.leadId ?? '');
  const frontendLead = employees.find(({ node }) =>
    node.id === leadId || node.properties?.username === leadId || node.properties?.id === leadId
  );
  const frontendLines = [
    `Employees with a Frontend job title: ${frontendPeople.map(({ node }) => `${node.properties?.name} (${node.properties?.jobTitle}; team ${node.properties?.teamName})`).join('; ')}.`,
    `Recorded frontend/web team: ${String(frontendTeamProps.name ?? 'not specified')}; department: ${String(frontendTeamProps.departmentName ?? 'not specified')}; recorded lead: ${String(frontendLead?.node.properties?.name ?? 'not specified')}.`,
    `No explicit mentoring assignment is recorded. For a frontend mentoring contact recommendation, ${String(frontendLead?.node.properties?.name ?? 'the recorded Web Team lead')} is the closest role-based contact because they lead the Web Team${frontendLead?.node.properties?.jobTitle ? ` and their job title is ${String(frontendLead.node.properties.jobTitle)}` : ''}; present this as a suggestion based on role, not as a verified mentor assignment.`
  ];
  outputs.push(makeSource('frontend-responsibility', 'responsibilities', 'Frontend and web team responsibility', frontendLines.join('\n')));
  return outputs;
}

function nodeNameFor(node: GraphNode): string {
  const properties = node.properties ?? {};
  return String(properties.name ?? properties.displayName ?? properties.title ?? properties.summary ?? node.id);
}
