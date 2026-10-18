import type { GraphNode, SeedData } from '../types/seed.js';

const names = ['Ava Patel','Noah Williams','Mia Chen','Liam Johnson','Sofia Garcia','Ethan Brown','Isha Mehta','Lucas Martin','Zoe Davis','Arjun Rao','Emma Wilson','Oliver Taylor','Nora Singh','Mateo Anderson','Leah Thomas','Henry Moore','Anika Shah','James Jackson','Maya White','Daniel Harris','Priya Kumar','Benjamin Clark','Sara Lewis','William Young','Riya Walker','Michael Hall','Tara Allen','Alexander King','Neha Wright','Sebastian Scott','Diya Green','Jack Baker','Elena Adams','David Nelson','Meera Hill','Leo Ramirez','Aanya Campbell','Owen Mitchell','Kavya Roberts','Samuel Carter','Nina Phillips','Logan Evans','Aditi Turner','Matthew Torres','Ivy Parker','Rohan Collins','Grace Edwards','Kiran Stewart','Jacob Sanchez','Anaya Morris','Caleb Rogers','Pooja Reed','Mason Cook','Simran Morgan','Eli Bell','Zara Murphy'];
const departments = [
  ['swe','Software Engineering','eng'], ['devops','DevOps & Reliability','platform'], ['paymentintegration','Payment Integration','payments'],
  ['product','Product','product-team'], ['design','Design','design-team'], ['security','Security','security-team'], ['customer-success','Customer Success','success']
];
const titles = ['Software Engineer','Senior Software Engineer','Staff Engineer','Engineering Manager','Product Manager','SRE','Security Engineer','Product Designer','Customer Success Manager'];
const attrition = new Map<number, { status: 'RESIGNED' | 'OFFBOARDED'; reason: string; departureOffset: number }>([
  [3, { status: 'RESIGNED', reason: 'career transition', departureOffset: 220 }],
  [16, { status: 'OFFBOARDED', reason: 'role eliminated during team restructuring', departureOffset: 180 }],
  [29, { status: 'RESIGNED', reason: 'relocated internationally', departureOffset: 240 }],
  [42, { status: 'RESIGNED', reason: 'accepted an opportunity at another company', departureOffset: 90 }],
  [55, { status: 'OFFBOARDED', reason: 'performance expectations not met', departureOffset: 300 }]
]);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (start: Date, days: number) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
const node = (type: GraphNode['type'], id: string, properties: Record<string, unknown>): GraphNode => ({ type, id, properties: { id, ...properties } });

export function generateSeedData(companyStartDate = process.env.COMPANY_START_DATE ?? '2026-01-01'): SeedData {
  const end = new Date(`${companyStartDate}T00:00:00Z`);
  if (Number.isNaN(end.valueOf())) throw new Error('COMPANY_START_DATE must be an ISO date');
  const founded = new Date(end); founded.setUTCFullYear(founded.getUTCFullYear() - 3);
  const nodes: GraphNode[] = [];
  const edges: SeedData['edges'] = [];
  const add = (n: GraphNode) => nodes.push(n);
  add(node('Company','hirenova',{ name:'Hirenova', foundedAt:iso(founded), companyStartDate, sourceSystem:'seed', sourceRecordId:'company-hirenova', externalUrl:'https://example.com/hirenova', createdAt:iso(founded) }));
  departments.forEach(([id,name,teamId], i) => {
    add(node('Department',id,{ name, slug:id, createdAt:dateAt(founded, i * 42), updatedAt:companyStartDate, sourceSystem:'seed', sourceRecordId:`dept-${id}` }));
    add(node('Team',teamId,{ name:`${name} Team`, departmentId:id, createdAt:dateAt(founded, i * 42), updatedAt:companyStartDate, sourceSystem:'seed', sourceRecordId:`team-${teamId}` }));
    edges.push({from:'hirenova',to:id,type:'HAS_DEPARTMENT'},{from:id,to:teamId,type:'HAS_TEAM'});
  });
  const deptIds = departments.map(d=>d[0]); const teamIds = departments.map(d=>d[2]);
  names.forEach((name, i) => {
    const departmentId = deptIds[i % deptIds.length], teamId = teamIds[i % teamIds.length];
    const managerId = i === 0 ? null : `emp-${String(Math.floor((i - 1) / 4)).padStart(2,'0')}`;
    const joinedAt = dateAt(founded, 20 + ((i * 47) % 1060));
    const departure = attrition.get(i);
    add(node('Employee',`emp-${String(i).padStart(2,'0')}`,{ employeeId:`HN-${String(i+1).padStart(4,'0')}`, name, email:`${name.toLowerCase().replace(/[^a-z]+/g,'.')}@hirenova.com`, profilePictureUrl:`https://images.example.com/hirenova/${i}.png`, jobTitle:titles[i % titles.length], departmentId, teamId, managerId, joinedAt, employmentStatus:departure?.status ?? 'active', ...(departure ? { leftAt:dateAt(new Date(`${joinedAt}T00:00:00Z`), departure.departureOffset), departureReason:departure.reason } : {}), seniority:i % 5 === 0 ? 'staff' : i % 3 === 0 ? 'senior' : 'mid', skills:['typescript','systems','communication'].slice(0, 1 + i % 3), location:i % 3 === 0 ? 'Remote' : 'Bengaluru', sourceSystem:'seed', sourceRecordId:`employee-${i}`, createdAt:joinedAt, updatedAt:companyStartDate }));
    edges.push({from:`emp-${String(i).padStart(2,'0')}`,to:departmentId,type:'WORKS_IN'},{from:`emp-${String(i).padStart(2,'0')}`,to:teamId,type:'MEMBER_OF'});
    if (managerId) edges.push({from:`emp-${String(i).padStart(2,'0')}`,to:managerId,type:'REPORTS_TO'});
  });
  const addRecord = (type: GraphNode['type'], id: string, props: Record<string, unknown>) => add(node(type,id,{...props,sourceSystem:props.sourceSystem ?? 'seed',sourceRecordId:props.sourceRecordId ?? id,externalUrl:props.externalUrl ?? `https://example.com/${String(type).toLowerCase()}/${id}`,createdAt:props.createdAt ?? companyStartDate,updatedAt:companyStartDate}));
  ['ledger-reconciliation','instant-refunds','reliability-foundation'].forEach((id,i)=>{ addRecord('Project',id,{name:id.replaceAll('-',' '),status:i===2?'active':'completed',ownerId:`emp-${String(i+1).padStart(2,'0')}`,validFrom:dateAt(founded,200+i*250)}); edges.push({from:`emp-${String(i+1).padStart(2,'0')}`,to:id,type:'OWNS'}); });
  ['payments-api','checkout-web','platform-runtime'].forEach((id,i)=>{ addRecord('Service',id,{name:id,teamId:teamIds[i],status:'operational'}); edges.push({from:teamIds[i],to:id,type:'MAINTAINS'}); });
  ['payment-core','platform-infra','customer-portal'].forEach((id,i)=>{ addRecord('Repository',id,{name:id,projectId:['ledger-reconciliation','reliability-foundation','instant-refunds'][i]}); edges.push({from:id,to:['payments-api','platform-runtime','checkout-web'][i],type:'DEPENDS_ON'}); });
  addRecord('Document','doc-idempotency',{title:'Idempotent payment commands',authorId:'emp-02',projectId:'ledger-reconciliation',validFrom:dateAt(founded,320),content:'Decision record for safe retries.'}); edges.push({from:'emp-02',to:'doc-idempotency',type:'AUTHORED'});
  addRecord('Decision','decision-idempotency',{title:'Use idempotency keys for payment writes',documentId:'doc-idempotency',validFrom:dateAt(founded,325),status:'accepted'}); edges.push({from:'doc-idempotency',to:'decision-idempotency',type:'DESCRIBES'});
  addRecord('Incident','incident-duplicate-charge',{title:'Duplicate charge regression',severity:'high',occurredAt:dateAt(founded,550),serviceId:'payments-api',resolvedAt:dateAt(founded,553)}); edges.push({from:'incident-duplicate-charge',to:'payments-api',type:'AFFECTS'});
  addRecord('Channel','payments-eng',{name:'#payments-eng',purpose:'Payment engineering collaboration'}); addRecord('Message','msg-idempotency',{text:'The idempotency decision is ready for implementation.',authorId:'emp-02',channelId:'payments-eng',occurredAt:dateAt(founded,326)}); edges.push({from:'decision-idempotency',to:'payments-eng',type:'DISCUSSED_IN'},{from:'msg-idempotency',to:'payments-eng',type:'POSTED_IN'},{from:'emp-02',to:'msg-idempotency',type:'AUTHORED'});
  addRecord('Task','task-idempotency',{title:'Implement idempotency middleware',status:'done',projectId:'ledger-reconciliation',assigneeId:'emp-03',createdAt:dateAt(founded,327)}); edges.push({from:'decision-idempotency',to:'task-idempotency',type:'CREATES'},{from:'emp-03',to:'task-idempotency',type:'ASSIGNED_TO'});
  addRecord('PullRequest','pr-idempotency',{title:'Add idempotency middleware',status:'merged',repositoryId:'payment-core',authorId:'emp-03',mergedAt:dateAt(founded,335)}); edges.push({from:'task-idempotency',to:'pr-idempotency',type:'IMPLEMENTS'},{from:'pr-idempotency',to:'payments-api',type:'UPDATES'},{from:'emp-03',to:'pr-idempotency',type:'AUTHORED'});
  return { nodes, edges, companyStartDate };
}
