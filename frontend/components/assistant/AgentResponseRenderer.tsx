"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, GitBranch, Network } from "lucide-react";
import { z } from "zod";
import { api, entityName } from "@/lib/api";
import type { AssistantResponse, Entity, GraphEntityType } from "@/lib/types";

const types = ["Company","Employee","Department","Team","Project","Repository","Service","Document","Decision","Incident","Task","PullRequest","Channel","Message","Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","Commit","Comment","Activity","Review"] as const;
const schema = z.object({ answer: z.object({ type:z.enum(["company_overview","entity_lookup","ownership_lookup","decision_investigation","impact_analysis","knowledge_graph_query","general_explanation"]), title:z.string(), summary:z.string(), findings:z.array(z.object({text:z.string(),confidence:z.enum(["confirmed","inferred","unknown"]),citationIds:z.array(z.string())})), citations:z.array(z.object({entityId:z.string(),entityType:z.enum(types),title:z.string(),sourceSystem:z.string().optional(),sourceRecordId:z.string().optional(),sourceUrl:z.string().url().optional(),excerpt:z.string().optional()})), related_entities:z.array(z.object({id:z.string(),entityType:z.enum(types),name:z.string().optional(),title:z.string().optional()}).passthrough()), suggested_actions:z.array(z.object({label:z.string(),type:z.enum(["open_entity","show_dependencies","investigate"]),entityId:z.string()})), uncertainty:z.string() }), ui:z.object({component:z.enum(["company_overview","entity_detail","ownership_panel","decision_timeline","impact_analysis","knowledge_graph","general_response"]),layout:z.enum(["compact","split"]),interactions:z.array(z.object({type:z.enum(["open_entity","show_dependencies","investigate"]),entityId:z.string()})),graph:z.object({nodes:z.array(z.object({id:z.string(),entityType:z.enum(types).optional(),name:z.string().optional(),title:z.string().optional()}).passthrough()),edges:z.array(z.object({from:z.string(),to:z.string(),type:z.string(),direction:z.enum(["incoming","outgoing"]).optional()}))})}),execution:z.object({status:z.enum(["completed","partial","failed"]),stages:z.array(z.object({name:z.string(),status:z.enum(["completed","fallback","skipped","failed"])})),errors:z.array(z.string())})});
const fallbackSchema=z.object({answer:z.object({title:z.string().optional(),summary:z.string().optional(),uncertainty:z.string().optional(),citations:z.array(z.object({entityId:z.string(),entityType:z.enum(types),title:z.string(),sourceUrl:z.string().url().optional(),excerpt:z.string().optional()}).passthrough()).optional()}).passthrough()}).passthrough();

function path(type: string, id: string) {
  if(type==="Employee") return `/people/${encodeURIComponent(id)}`;
  if(type==="Department") return `/departments/${encodeURIComponent(id)}`;
  if(type==="Project") return `/projects/${encodeURIComponent(id)}`;
  const product=["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","Commit","Comment","Activity","Review"].includes(type);
  return `/org-graph?${product?"mode=product&":""}focus=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
}
function EntityLink({entity,type}:{entity:Entity;type:string}) { return <Link className="agent-entity-link" href={path(type,entity.id)} onClick={()=>{window.dispatchEvent(new CustomEvent("oig-graph-selection",{detail:{entity:{...entity,entityType:type},entityType:type}}));window.dispatchEvent(new CustomEvent("oig-graph-focus",{detail:{id:entity.id,type,mode:["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","Commit","Comment","Activity","Review"].includes(type)?"product":"team"}}));}}><span>{type}</span><b>{entityName(entity)}</b><ArrowUpRight size={11}/></Link>; }

export function AgentResponseRenderer({payload,onAction}:{payload:unknown;onAction?:(type:"open_entity"|"show_dependencies"|"investigate",entityId:string)=>void}) {
  const parsed=schema.safeParse(payload);
  const [neighborhood,setNeighborhood]=useState<AssistantResponse["ui"]["graph"]|null>(null);
  const [busy,setBusy]=useState(false);
  if(!parsed.success){const fallback=fallbackSchema.safeParse(payload);if(!fallback.success)return <article className="agent-response-card"><p className="agent-muted">Unsupported structured response. The response payload did not pass validation.</p></article>;const answer=fallback.data.answer;return <article className="agent-response-card"><div className="agent-entity-summary"><small>General response</small><h3>{answer.title??"Workspace answer"}</h3><p>{answer.summary??"No summary was provided."}</p></div>{answer.citations?.map(c=><div className="agent-evidence" key={c.entityId}><EntityLink entity={{id:c.entityId,title:c.title} as Entity} type={c.entityType}/>{c.sourceUrl&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">Open original source</a>}{c.excerpt&&<p>{c.excerpt}</p>}</div>)}{answer.uncertainty&&<p className="agent-uncertainty">{answer.uncertainty}</p>}</article>;}
  const response=parsed.data;
  const answer=response.answer;
  const nodes=neighborhood?.nodes??response.ui.graph.nodes;
  const edges=neighborhood?.edges??response.ui.graph.edges;
  async function act(type:"open_entity"|"show_dependencies"|"investigate",id:string) {
    if(type==="show_dependencies") {
      const entity=answer.related_entities.find(item=>item.id===id)??answer.citations.find(item=>item.entityId===id);
      const found=entity??response.ui.graph.nodes.find(item=>item.id===id);
      if(found?.entityType){setBusy(true);try{setNeighborhood(await api.neighborhood(found.entityType,id));}catch{onAction?.(type,id);}finally{setBusy(false);}}
    } else onAction?.(type,id);
  }
  const temporal=[...nodes].sort((a,b)=>Date.parse(String(a.occurredAt??a.validFrom??a.createdAt??a.updatedAt??""))-Date.parse(String(b.occurredAt??b.validFrom??b.createdAt??b.updatedAt??"")));
  return <article className="agent-response-card">
    <div className="agent-entity-summary"><small>{answer.type.replaceAll("_"," ")}</small><h3>{answer.title}</h3><p>{answer.summary}</p></div>
    {answer.findings.length>0&&<section className="agent-response-section"><h4>Findings</h4>{answer.findings.map((item,i)=><div className="agent-edge-row" key={`${i}:${item.text}`}><b>{item.confidence}</b> · {item.text}</div>)}</section>}
    {answer.type==="decision_investigation"&&<section className="agent-response-section"><h4>Connected record timeline</h4>{temporal.length?<ol className="agent-timeline">{temporal.map(item=><li key={item.id}><span>{String(item.occurredAt??item.validFrom??item.createdAt??item.updatedAt??"Date not recorded")}</span><EntityLink entity={item} type={item.entityType??"Document"}/></li>)}</ol>:<p className="agent-muted">No dated connected records returned.</p>}</section>}
    {answer.type==="impact_analysis"&&<section className="agent-response-section"><h4><Network size={12}/> Recorded dependencies</h4><p className="agent-muted">Graph traversal only; no simulation was run.</p>{nodes.map(item=><EntityLink key={item.id} entity={item} type={item.entityType??"Unknown"}/>)}</section>}
    {answer.type==="ownership_lookup"&&<section className="agent-response-section"><h4>People and groups</h4>{answer.related_entities.filter(item=>["Employee","Team","Department"].includes(item.entityType)).map(item=><EntityLink key={item.id} entity={item} type={item.entityType}/>)}</section>}
    {answer.related_entities.length>0&&answer.type!=="ownership_lookup"&&<section className="agent-response-section"><h4><GitBranch size={12}/> Related entities</h4><div className="agent-card-list">{answer.related_entities.slice(0,8).map(item=><EntityLink key={item.id} entity={item} type={item.entityType}/>)}</div></section>}
    {edges.length>0&&<section className="agent-response-section"><h4>Graph relationships</h4>{edges.slice(0,12).map((edge,i)=><div className="agent-edge-row" key={`${edge.from}:${edge.to}:${i}`}>{edge.type} · {edge.from} → {edge.to}</div>)}</section>}
    {neighborhood&&answer.type!=="impact_analysis"&&<section className="agent-response-section"><h4>Loaded neighborhood</h4>{nodes.map(item=><EntityLink key={item.id} entity={item} type={item.entityType??"Unknown"}/>)}</section>}
    {answer.citations.length>0&&<section className="agent-response-section"><h4>Evidence and sources</h4>{answer.citations.slice(0,8).map(c=><div className="agent-evidence" key={c.entityId}><EntityLink entity={{id:c.entityId,title:c.title} as Entity} type={c.entityType}/>{c.sourceUrl&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">Open original source <ArrowUpRight size={11}/></a>}{c.excerpt&&<p>{c.excerpt}</p>}</div>)}</section>}
    {answer.suggested_actions.length>0&&<section className="agent-response-section"><h4>Next actions</h4>{answer.suggested_actions.map((item,i)=><button className="small-button" type="button" key={`${i}:${item.entityId}`} disabled={busy} onClick={()=>void act(item.type,item.entityId)}>{busy?"Loading…":item.label}</button>)}</section>}
    {answer.uncertainty&&<p className="agent-uncertainty">{answer.uncertainty}</p>}
    {response.execution.stages.length>0&&<details className="agent-execution"><summary>Agent activity · {response.execution.status}</summary><p>{response.execution.stages.map(s=>`${s.name}: ${s.status}`).join(" · ")}</p>{response.execution.errors.map((e,i)=><p key={i}>{e}</p>)}</details>}
  </article>;
}
