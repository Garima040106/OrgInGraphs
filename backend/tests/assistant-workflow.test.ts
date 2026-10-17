import assert from 'node:assert/strict';
import test from 'node:test';
import { runAssistantWorkflow } from '../src/workflow/assistant-workflow.js';
import type { Graph } from 'falkordb';

function fakeGraph() {
  return { query: async (cypher: string) => {
    if (cypher.includes('MATCH (start:')) return { data: [
      { start: { properties: { id:'service-billing', name:'Billing', status:'active' } }, n: { properties: { id:'team-payments', name:'Payments' } }, entityType:'Team', relationship:'OWNED_BY', relationshipStart:{id:'service-billing'}, relationshipEnd:{id:'team-payments'} },
      { start: { properties: { id:'service-billing', name:'Billing', status:'active' } }, n: { properties: { id:'document-billing', title:'Billing ownership record', content:'Payments maintains Billing.' } }, entityType:'Document', relationship:'DOCUMENTS', relationshipStart:{id:'document-billing'}, relationshipEnd:{id:'service-billing'} }
    ] };
    if (cypher.includes('MATCH (n:Service')) return { data:[{ n:{properties:{id:'service-billing',name:'Billing',status:'active'}},entityType:'Service' }] };
    return { data:[] };
  } } as unknown as Graph;
}

test('LangGraph assistant returns validated ownership UI with actual graph evidence', async()=>{
  const response=await runAssistantWorkflow({question:'Who owns billing?',context:{entityId:'service-billing',entityType:'Service'}},fakeGraph());
  assert.equal('answer' in response,true);
  if(!('answer' in response)) return;
  assert.equal(response.answer.type,'ownership_lookup');
  assert.equal(response.ui.component,'ownership_panel');
  assert.ok(response.answer.related_entities.some(entity=>entity.id==='team-payments'));
  assert.ok(response.ui.graph.edges.some(edge=>edge.type==='OWNED_BY'));
  assert.ok(['completed', 'partial'].includes(response.execution.status));
});

test('LangGraph assistant labels impact as direct traversal and does not claim simulation', async()=>{
  const response=await runAssistantWorkflow({question:'What could break if we deprecate billing?',context:{entityId:'service-billing',entityType:'Service'}},fakeGraph());
  assert.equal('answer' in response,true);
  if(!('answer' in response)) return;
  assert.equal(response.answer.type,'impact_analysis');
  assert.match(response.answer.uncertainty,/no multi-hop risk analysis or simulation/i);
  assert.match(response.answer.summary,/not a simulation/i);
});
