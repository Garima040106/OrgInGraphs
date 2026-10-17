import { createHash } from 'node:crypto';
import type { Graph } from 'falkordb';
import { query, rows } from '../../../db/falkordb.js';
import { generateSeedData } from '../../../seed/generate.js';
import type { DiscoveredSource } from '../types.js';

export async function extractDatabaseSources(graph?: Graph): Promise<DiscoveredSource[]> {
  const sources: DiscoveredSource[] = [];

  // Try extracting live graph data if connected
  if (graph) {
    try {
      // 1. Company
      const companyRes = await query(graph, 'MATCH (c:Company) RETURN c LIMIT 1');
      const company = rows(companyRes)[0]?.c as Record<string, unknown> | undefined;
      if (company && typeof company.name === 'string') {
        const text = [
          `# Company Profile: ${company.name}`,
          `Organization Name: ${company.name}`,
          company.foundedAt ? `Founded: ${company.foundedAt}` : '',
          company.companyStartDate ? `Company Start Date: ${company.companyStartDate}` : '',
          company.externalUrl ? `Official Website: ${company.externalUrl}` : '',
          'Description: Hirenova is an AI-powered talent intelligence and organizational knowledge platform operating across multiple engineering, product, and platform disciplines.'
        ].filter(Boolean).join('\n');

        sources.push({
          id: 'db:company:hirenova',
          type: 'database',
          path: 'database/Company/hirenova',
          title: `Company Profile - ${company.name}`,
          content: text,
          metadata: { entityType: 'Company', entityId: 'hirenova' },
          hash: createHash('sha256').update(text).digest('hex')
        });
      }

      // 2. Departments and Teams
      const deptRes = await query(graph, `
        MATCH (d:Department)
        OPTIONAL MATCH (d)-[:HAS_TEAM]->(t:Team)
        OPTIONAL MATCH (d)<-[:WORKS_IN]-(e:Employee)
        OPTIONAL MATCH (h:Employee)-[:HEADS]->(d)
        RETURN d, collect(DISTINCT t) AS teams, count(DISTINCT e) AS employeeCount, collect(DISTINCT h.name) AS heads
      `);
      for (const row of rows(deptRes)) {
        const d = row.d as Record<string, unknown> | undefined;
        if (!d || typeof d.name !== 'string') continue;
        const teams = (row.teams as Array<Record<string, unknown>> ?? []).filter((t) => t && t.name);
        const heads = (row.heads as string[] ?? []).filter(Boolean);
        const count = row.employeeCount ?? 0;

        const text = [
          `# Department: ${d.name} (${d.slug ?? d.id})`,
          `Department Name: ${d.name}`,
          `Slug / Identifier: ${d.slug ?? d.id}`,
          `Employee Headcount: ${count}`,
          heads.length ? `Department Heads: ${heads.join(', ')}` : 'Department Heads: None designated',
          teams.length ? `Sub-Teams:\n${teams.map((t) => `  - ${t.name} (id: ${t.id})`).join('\n')}` : 'Sub-Teams: None recorded'
        ].join('\n');

        sources.push({
          id: `db:department:${d.id ?? d.slug}`,
          type: 'database',
          path: `database/Department/${d.id ?? d.slug}`,
          title: `Department Overview - ${d.name}`,
          content: text,
          metadata: { entityType: 'Department', entityId: String(d.id ?? d.slug), headcount: count },
          hash: createHash('sha256').update(text).digest('hex')
        });
      }

      // 3. Projects and dependent services
      const projectRes = await query(graph, `
        MATCH (p:Project)
        OPTIONAL MATCH (o:Employee)-[:OWNS]->(p)
        OPTIONAL MATCH (c:Employee)-[:WORKS_ON]->(p)
        OPTIONAL MATCH (p)<-[:WORKS_ON]-(s:Service)
        RETURN p, collect(DISTINCT o.name) AS owners, collect(DISTINCT c.name) AS contributors, collect(DISTINCT s.name) AS services
      `);
      for (const row of rows(projectRes)) {
        const p = row.p as Record<string, unknown> | undefined;
        if (!p || typeof p.name !== 'string') continue;
        const owners = (row.owners as string[] ?? []).filter(Boolean);
        const contributors = (row.contributors as string[] ?? []).filter(Boolean);
        const services = (row.services as string[] ?? []).filter(Boolean);

        const text = [
          `# Project: ${p.name}`,
          `Project Name: ${p.name}`,
          `Identifier: ${p.id}`,
          `Status: ${p.status ?? 'active'}`,
          owners.length ? `Owners: ${owners.join(', ')}` : '',
          services.length ? `Associated Services: ${services.join(', ')}` : '',
          contributors.length ? `Contributors: ${contributors.join(', ')}` : ''
        ].filter(Boolean).join('\n');

        sources.push({
          id: `db:project:${p.id}`,
          type: 'database',
          path: `database/Project/${p.id}`,
          title: `Project - ${p.name}`,
          content: text,
          metadata: { entityType: 'Project', entityId: String(p.id) },
          hash: createHash('sha256').update(text).digest('hex')
        });
      }

      // 4. Services
      const serviceRes = await query(graph, `
        MATCH (s:Service)
        OPTIONAL MATCH (t:Team)-[:MAINTAINS]->(s)
        OPTIONAL MATCH (r:Repository)-[:DEPENDS_ON]->(s)
        RETURN s, t.name AS teamName, collect(DISTINCT r.name) AS repositories
      `);
      for (const row of rows(serviceRes)) {
        const s = row.s as Record<string, unknown> | undefined;
        if (!s || typeof s.name !== 'string') continue;
        const repos = (row.repositories as string[] ?? []).filter(Boolean);

        const text = [
          `# Service: ${s.name}`,
          `Service ID: ${s.id}`,
          `Status: ${s.status ?? 'operational'}`,
          row.teamName ? `Maintaining Team: ${row.teamName}` : '',
          repos.length ? `Dependent Repositories: ${repos.join(', ')}` : ''
        ].filter(Boolean).join('\n');

        sources.push({
          id: `db:service:${s.id}`,
          type: 'database',
          path: `database/Service/${s.id}`,
          title: `Service - ${s.name}`,
          content: text,
          metadata: { entityType: 'Service', entityId: String(s.id) },
          hash: createHash('sha256').update(text).digest('hex')
        });
      }

      // 5. Decisions and Incident records
      const decisionRes = await query(graph, `
        MATCH (d:Decision)
        OPTIONAL MATCH (doc:Document)-[:DESCRIBES]->(d)
        OPTIONAL MATCH (a:Employee)-[:AUTHORED]->(doc)
        RETURN d, doc.title AS docTitle, doc.content AS docContent, a.name AS authorName
      `);
      for (const row of rows(decisionRes)) {
        const d = row.d as Record<string, unknown> | undefined;
        if (!d || typeof d.title !== 'string') continue;

        const text = [
          `# Architectural Decision: ${d.title}`,
          `Decision ID: ${d.id}`,
          `Status: ${d.status ?? 'accepted'}`,
          d.validFrom ? `Effective Date: ${d.validFrom}` : '',
          row.authorName ? `Author: ${row.authorName}` : '',
          row.docTitle ? `Associated Document: ${row.docTitle}` : '',
          row.docContent ? `Details:\n${row.docContent}` : ''
        ].filter(Boolean).join('\n');

        sources.push({
          id: `db:decision:${d.id}`,
          type: 'database',
          path: `database/Decision/${d.id}`,
          title: `Architectural Decision - ${d.title}`,
          content: text,
          metadata: { entityType: 'Decision', entityId: String(d.id) },
          hash: createHash('sha256').update(text).digest('hex')
        });
      }

      if (sources.length > 0) return sources;
    } catch {
      // Fall through to deterministic seed extraction
    }
  }

  // Deterministic fallback using seed data
  const seed = generateSeedData();
  const companyNode = seed.nodes.find((n) => n.type === 'Company');
  if (companyNode) {
    const text = [
      `# Company Profile: ${companyNode.properties.name}`,
      `Organization Name: ${companyNode.properties.name}`,
      `Founded: ${companyNode.properties.foundedAt ?? 'Three years prior to company start date'}`,
      `Company Start Date: ${companyNode.properties.companyStartDate ?? seed.companyStartDate}`,
      `Official Website: ${companyNode.properties.externalUrl ?? 'https://example.com/hirenova'}`,
      'Description: Hirenova is an AI-powered talent intelligence and organizational knowledge platform with 7 core departments and distributed teams across Bengaluru and remote.'
    ].join('\n');

    sources.push({
      id: 'db:company:hirenova',
      type: 'database',
      path: 'database/Company/hirenova',
      title: `Company Profile - ${companyNode.properties.name}`,
      content: text,
      metadata: { entityType: 'Company', entityId: 'hirenova' },
      hash: createHash('sha256').update(text).digest('hex')
    });
  }

  // Extract departments from seed
  const deptNodes = seed.nodes.filter((n) => n.type === 'Department');
  const teamNodes = seed.nodes.filter((n) => n.type === 'Team');
  const employeeNodes = seed.nodes.filter((n) => n.type === 'Employee');

  for (const dept of deptNodes) {
    const deptTeams = teamNodes.filter((t) => t.properties.departmentId === dept.id);
    const deptEmployees = employeeNodes.filter((e) => e.properties.departmentId === dept.id);
    const activeCount = deptEmployees.filter((e) => e.properties.employmentStatus === 'active').length;

    const text = [
      `# Department: ${dept.properties.name} (${dept.id})`,
      `Department Name: ${dept.properties.name}`,
      `Slug / ID: ${dept.id}`,
      `Total Employees: ${deptEmployees.length} (${activeCount} active)`,
      deptTeams.length ? `Teams:\n${deptTeams.map((t) => `  - ${t.properties.name} (id: ${t.id})`).join('\n')}` : '',
      `Sample Key Members:\n${deptEmployees.slice(0, 5).map((e) => `  - ${e.properties.name} (${e.properties.jobTitle}) - ${e.properties.employmentStatus}`).join('\n')}`
    ].filter(Boolean).join('\n');

    sources.push({
      id: `db:department:${dept.id}`,
      type: 'database',
      path: `database/Department/${dept.id}`,
      title: `Department Overview - ${dept.properties.name}`,
      content: text,
      metadata: { entityType: 'Department', entityId: dept.id, headcount: deptEmployees.length },
      hash: createHash('sha256').update(text).digest('hex')
    });
  }

  // Extract projects & services from seed
  const projectNodes = seed.nodes.filter((n) => n.type === 'Project');
  for (const p of projectNodes) {
    const text = [
      `# Project: ${p.properties.name}`,
      `Project Identifier: ${p.id}`,
      `Status: ${p.properties.status}`,
      `Owner Employee ID: ${p.properties.ownerId}`
    ].join('\n');

    sources.push({
      id: `db:project:${p.id}`,
      type: 'database',
      path: `database/Project/${p.id}`,
      title: `Project - ${p.properties.name}`,
      content: text,
      metadata: { entityType: 'Project', entityId: p.id },
      hash: createHash('sha256').update(text).digest('hex')
    });
  }

  const serviceNodes = seed.nodes.filter((n) => n.type === 'Service');
  for (const s of serviceNodes) {
    const text = [
      `# Service: ${s.properties.name}`,
      `Service ID: ${s.id}`,
      `Status: ${s.properties.status}`,
      `Maintained by Team ID: ${s.properties.teamId}`
    ].join('\n');

    sources.push({
      id: `db:service:${s.id}`,
      type: 'database',
      path: `database/Service/${s.id}`,
      title: `Service - ${s.properties.name}`,
      content: text,
      metadata: { entityType: 'Service', entityId: s.id },
      hash: createHash('sha256').update(text).digest('hex')
    });
  }

  return sources;
}
