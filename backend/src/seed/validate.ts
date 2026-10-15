import type { SeedData } from '../types/seed.js';
export function validateSeedData(data: SeedData): string[] {
  const errors: string[] = []; const ids = new Set<string>();
  for (const n of data.nodes) { if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`); ids.add(n.id); }
  const employees = data.nodes.filter(n=>n.type==='Employee'); if (employees.length !== 56) errors.push(`expected 56 employees, found ${employees.length}`);
  for (const e of employees) {
    const p=e.properties; for (const key of ['employeeId','name','email','profilePictureUrl','jobTitle','departmentId','teamId','joinedAt','employmentStatus','seniority','skills','location']) if (!(key in p)) errors.push(`${e.id} missing ${key}`);
    const status = String(p.employmentStatus);
    if (!['active', 'RESIGNED', 'OFFBOARDED'].includes(status)) errors.push(`${e.id} has invalid employmentStatus: ${status}`);
    if (status === 'active' && ('leftAt' in p || 'departureReason' in p)) errors.push(`${e.id} active employee has departure fields`);
    if (status !== 'active') {
      if (!p.leftAt) errors.push(`${e.id} missing leftAt`);
      if (!p.departureReason) errors.push(`${e.id} missing departureReason`);
      if (typeof p.leftAt === 'string' && typeof p.joinedAt === 'string' && (p.leftAt <= p.joinedAt || p.leftAt > data.companyStartDate)) errors.push(`${e.id} has invalid departure chronology`);
    }
    for (const ref of ['departmentId','teamId','managerId']) if (p[ref] && !ids.has(String(p[ref]))) errors.push(`${e.id} invalid ${ref}`);
  }
  const former = employees.filter((e) => e.properties.employmentStatus !== 'active');
  if (former.length < 4 || former.length > 6) errors.push(`expected 4-6 former employees, found ${former.length}`);
  for (const edge of data.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`invalid edge ${edge.from}->${edge.to}`);
  const reports = new Map(employees.map(e=>[e.id, e.properties.managerId as string | null])); for (const e of employees) { const seen=new Set<string>(); let cur: string|null=e.id; while(cur){ if(seen.has(cur)){errors.push(`circular reporting chain at ${e.id}`);break;} seen.add(cur); cur=reports.get(cur)??null; } }
  return errors;
}
