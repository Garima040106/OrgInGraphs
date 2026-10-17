"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, ArrowUpRight, Building2, CircleAlert, Clock3, ExternalLink, FileText, GitPullRequest, MessagesSquare, Network, Plug, RefreshCw, Server, Sparkles, UsersRound } from "lucide-react";
import { OrganizationGraph } from "@/components/graph/OrganizationGraph";
import { api, friendlyApiError } from "@/lib/api";
import { isProductGraphEntity } from "@/lib/graph/mode";
import type { DashboardResponse, Entity, GraphApiNode, GraphResponse, IngestionResponse, IngestionSource } from "@/lib/types";

type GraphMode = "team" | "product";
type GraphState = { data: GraphResponse; loading: boolean; error: string };
type EntityFilter = { label: string; nodes: GraphApiNode[] } | null;
const emptyGraph: GraphResponse = { nodes: [], edges: [] };
const productTypes = new Set(["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","PullRequest","Commit","Comment","Activity","Review","Task"]);
const sourceOptions: Array<{ id: IngestionSource; label: string; detail: string; image: string }> = [
  { id: "confluence", label: "Confluence", detail: "Server credentials", image: "/img/confluence.png" },
  { id: "jira", label: "Jira", detail: "Backend demo source", image: "/img/jira.webp" },
  { id: "github", label: "GitHub", detail: "Backend demo source", image: "/img/github.png" },
  { id: "slack", label: "Slack", detail: "Backend demo source", image: "/img/slack.png" },
];

function typeOf(node: GraphApiNode) { return node.labels.find((label) => productTypes.has(label)) ?? node.labels[0] ?? "Unknown"; }
function recordTitle(node: GraphApiNode) { const value = node.properties.name ?? node.properties.title ?? node.properties.key ?? node.id; return typeof value === "string" ? value : node.id; }
function recordTime(node: GraphApiNode) { return [node.properties.occurredAt,node.properties.validFrom,node.properties.mergedAt,node.properties.updatedAt,node.properties.createdAt].find((value) => typeof value === "string") as string | undefined; }
function recordPath(node: GraphApiNode) {
  const type=typeOf(node);const id=encodeURIComponent(node.id);
  const graphMode=isProductGraphEntity(type,node.properties.graphDomain)?"product":"team";
  return `/org-graph?mode=${graphMode}&focus=${id}&type=${encodeURIComponent(type)}`;
}
function RecordLink({ node, children }: { node: GraphApiNode; children?: ReactNode }) {
  const type=typeOf(node);const entity={...node.properties,id:node.id,entityType:type} as Entity;
  const graphMode=isProductGraphEntity(type,node.properties.graphDomain)?"product":"team";
  const externalUrl = typeof node.properties.externalUrl === "string" && node.properties.externalUrl.startsWith("http") ? node.properties.externalUrl : null;
  const pageId = typeof node.properties.sourceRecordId === "string" ? node.properties.sourceRecordId : null;
  const isConfluence = String(node.properties.sourceSystem ?? "").toLowerCase().includes("confluence");

  return (
    <div className="bento-record-row" style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
      <Link className="bento-record" style={{ flex: 1, minWidth: 0 }} href={recordPath(node)} onClick={()=>{
        window.dispatchEvent(new CustomEvent("oig-graph-selection",{detail:{entity,entityType:type}}));
        window.dispatchEvent(new CustomEvent("oig-graph-focus",{detail:{id:node.id,type,mode:graphMode}}));
      }}>
        <span className="bento-record-type" title={isConfluence && pageId ? `Confluence page ${pageId}` : type}>
          {isConfluence && pageId ? `Confluence · #${pageId}` : type}
        </span>
        <b>{children??recordTitle(node)}</b>
        <ArrowUpRight size={12}/>
      </Link>
      {externalUrl && (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bento-external-link"
          title={`Open in ${isConfluence ? "Confluence" : "external source"}`}
          aria-label={`Open ${recordTitle(node)} in external source`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 9px",
            border: "1px solid var(--line)",
            borderRadius: "6px",
            background: "var(--paper)",
            color: "var(--muted)",
            transition: "all .14s ease",
            flexShrink: 0,
          }}
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
function relativeDate(value?: string) {
  if(!value)return "Date not recorded";const date=new Date(value);return Number.isNaN(date.valueOf())?"Date not recorded":date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}

export default function DashboardPage() {
  const [organization,setOrganization]=useState<GraphState>({data:emptyGraph,loading:true,error:""});
  const [product,setProduct]=useState<GraphState>({data:emptyGraph,loading:true,error:""});
  const [dashboardStats,setDashboardStats]=useState<Pick<DashboardResponse,"sourceCounts"|"totals">|null>(null);
  const [graphMode,setGraphMode]=useState<GraphMode>("team");
  const [focus,setFocus]=useState<{id?:string;type?:string;request:number}>({request:0});
  const [filter,setFilter]=useState<EntityFilter>(null);
  const [syncing,setSyncing]=useState<IngestionSource|null>(null);
  const [syncResult,setSyncResult]=useState<Partial<Record<IngestionSource,{result?:IngestionResponse;error?:string}>>>({});
  const current=graphMode==="team"?organization:product;

  const loadDashboard=useCallback(async()=>{setOrganization(previous=>({...previous,loading:true,error:""}));setProduct(previous=>({...previous,loading:true,error:""}));try{const result=await api.dashboard();setDashboardStats({sourceCounts:result.sourceCounts,totals:result.totals});setOrganization({data:result.organization,loading:false,error:""});setProduct({data:result.productProgress,loading:false,error:""});}catch(error){const message=friendlyApiError(error);setOrganization(previous=>({...previous,loading:false,error:message}));setProduct(previous=>({...previous,loading:false,error:message}));}},[]);
  const loadOrganization=loadDashboard;
  const loadProduct=loadDashboard;
  async function syncSource(source:IngestionSource){setSyncing(source);setSyncResult(previous=>({...previous,[source]:{}}));try{const result=await api.processIngestion(source);setSyncResult(previous=>({...previous,[source]:{result}}));if(result.outcomes.some(item=>item.status==="processed")){void loadDashboard();}}catch(error){setSyncResult(previous=>({...previous,[source]:{error:friendlyApiError(error)}}));}finally{setSyncing(null);}}

  useEffect(()=>{void loadDashboard();},[loadDashboard]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);if(params.get("mode")==="product")setGraphMode("product");
    setFocus((previous)=>({id:params.get("focus")??undefined,type:params.get("type")??undefined,request:previous.request+1}));
    const listener=(event:Event)=>{const detail=(event as CustomEvent<{id:string;type:string;mode?:GraphMode}>).detail;if(detail?.id&&detail.type){if(detail.mode)setGraphMode(detail.mode);setFocus(previous=>({...detail,request:previous.request+1}));}};
    window.addEventListener("oig-graph-focus",listener);return()=>window.removeEventListener("oig-graph-focus",listener);
  },[]);

  const combinedNodes=useMemo(()=>[...new Map([...organization.data.nodes,...product.data.nodes].map(node=>[node.id,node])).values()], [organization.data.nodes,product.data.nodes]);
  const combinedEdges=useMemo(()=>[...organization.data.edges,...product.data.edges], [organization.data.edges,product.data.edges]);
  const loaded=!organization.loading&&!product.loading;
  const decisions=useMemo(()=>combinedNodes.filter(node=>typeOf(node)==="Decision").sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const incidents=useMemo(()=>combinedNodes.filter(node=>typeOf(node)==="Incident"&&node.properties.resolvedAt==null&&!/resolved|closed|complete/i.test(String(node.properties.status??""))),[combinedNodes]);
  const activities=useMemo(()=>combinedNodes.filter(node=>["Activity","PullRequest","Incident","Task","Ticket","Bug","Message","Commit","Release"].includes(typeOf(node))&&recordTime(node)).sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const timeline=useMemo(()=>combinedNodes.filter(node=>["Decision","Incident","Activity","PullRequest","Release","Commit","Document"].includes(typeOf(node))&&recordTime(node)).sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const teams=combinedNodes.filter(node=>typeOf(node)==="Team");
  const services=combinedNodes.filter(node=>typeOf(node)==="Service");
  const issues=combinedNodes.filter(node=>["Ticket","Bug"].includes(typeOf(node))&&(!node.properties.sourceSystem||String(node.properties.sourceSystem).toLowerCase()==="jira"));
  const githubRecords=combinedNodes.filter(node=>String(node.properties.sourceSystem??"").toLowerCase()==="github");
  const confluenceRecords=combinedNodes.filter(node=>String(node.properties.sourceSystem??"").toLowerCase().includes("confluence")&&["Document","Decision"].includes(typeOf(node)));
  const slackRecords=combinedNodes.filter(node=>String(node.properties.sourceSystem??"").toLowerCase().includes("slack")&&["Message","Channel"].includes(typeOf(node)));
  const metrics=[
    {label:"Total entities",value:dashboardStats?.totals.entities??0,icon:Network,nodes:combinedNodes},
    {label:"Teams",value:dashboardStats?.totals.teams??0,icon:UsersRound,nodes:teams},
    {label:"Services",value:dashboardStats?.totals.services??0,icon:Server,nodes:services},
    {label:"Jira issues",value:dashboardStats?.sourceCounts.jira??0,icon:CircleAlert,nodes:issues},
    {label:"GitHub records",value:dashboardStats?.sourceCounts.github??0,icon:GitPullRequest,nodes:githubRecords},
    {label:"Confluence docs",value:dashboardStats?.sourceCounts.confluence??0,icon:FileText,nodes:confluenceRecords},
    {label:"Slack messages",value:dashboardStats?.sourceCounts.slack??0,icon:MessagesSquare,nodes:slackRecords},
  ];
  const unownedServices=services.filter(service=>{
    const hasOwner=combinedEdges.some(edge=>["MAINTAINS","OWNS","OWNED_BY","OWNED"].includes(edge.type)&&[edge.source,edge.target].includes(service.id));
    return !hasOwner&&!service.properties.teamId&&!service.properties.ownerId;
  });
  const metricsLoading=!loaded||dashboardStats===null;
  const latestActivity=activities.slice(0,5);
  const graphError=current.error;
  const apiFailures=organization.error?[{label:"Dashboard data",error:organization.error,retry:loadDashboard}]:[];

  return <>
    <div className="page-heading dashboard-bento-heading">
      <div className="dashboard-heading-copy"><div className="eyebrow"><span className="eyebrow-mark"/> Organizational intelligence</div><h1>Your organization, at a glance.</h1><p>Company signals, decisions, and dependencies in one connected view.</p></div>
      <div className="heading-actions"><button className="small-button primary-action" type="button" onClick={()=>void loadDashboard()} disabled={organization.loading||product.loading}><RefreshCw size={12}/> Refresh data</button><Link className="small-button" href="/settings"><Plug size={12}/> Sources</Link></div>
    </div>
    {apiFailures.map(item=><div className="bento-api-alert" role="alert" key={item.label}><CircleAlert size={14}/><span><b>{item.label} unavailable.</b> {item.error}</span><button className="small-button" type="button" onClick={item.retry}>Retry</button></div>)}

    <section className="bento-grid" aria-label="Company intelligence dashboard" aria-busy={!loaded}>
      <div className="bento-metrics" aria-label="Quick statistics">
      {metrics.map(({label,value,icon:Icon,nodes})=><button id={label==="Jira issues"?"tickets":undefined} key={label} type="button" className={`bento-card bento-metric ${filter?.label===label?"is-selected":""}`} onClick={()=>setFilter(previous=>previous?.label===label?null:{label,nodes})} aria-pressed={filter?.label===label}>
        <span className="bento-metric-icon"><Icon size={15}/></span><span className="bento-metric-copy"><small>{label}</small><b>{metricsLoading?"—":value}</b><span>{filter?.label===label?"Filtered view open":"Open records"}</span></span><ArrowRight size={13} className="bento-metric-arrow"/>
      </button>)}
      </div>

      <section className="bento-card bento-graph-card" aria-label="Company knowledge graph">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Network size={12}/> Knowledge graph</span><h2>Company connections</h2><p>Explore real graph records and expand any node to inspect dependencies.</p></div><button className="small-button" type="button" onClick={()=>current===organization?void loadOrganization():void loadProduct()} disabled={current.loading}><RefreshCw size={12}/> Refresh graph</button></div>
        <div className="graph-mode-switch" role="group" aria-label="Graph view"><button type="button" className={`graph-mode-option ${graphMode==="team"?"active":""}`} aria-pressed={graphMode==="team"} onClick={()=>setGraphMode("team")}>Company</button><button type="button" className={`graph-mode-option ${graphMode==="product"?"active":""}`} aria-pressed={graphMode==="product"} onClick={()=>setGraphMode("product")}>Product</button></div>
        {current.loading?<div className="bento-loading"><span className="spinner"/>Loading graph records…</div>:graphError?<div className="bento-empty bento-error"><CircleAlert size={16}/><b>Graph data unavailable</b><p>{graphError}</p><button className="small-button" type="button" onClick={()=>graphMode==="team"?void loadOrganization():void loadProduct()}>Retry</button></div>:<OrganizationGraph graph={current.data} graphMode={graphMode} focusId={focus.id} focusType={focus.type} focusRequest={focus.request}/>}
      </section>

      <section className="bento-card bento-insights-card" id="insights">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Sparkles size={12}/> Evidence signals</span><h2>{filter?.label??"Proactive insights"}</h2><p>{filter?`${filter.nodes.length} matching graph records`:"Deterministic checks from indexed company data"}</p></div>{filter&&<button className="bento-text-button" type="button" onClick={()=>setFilter(null)}>Clear</button>}</div>
        {filter?<div className="bento-list">{filter.nodes.length?filter.nodes.map(node=><RecordLink key={node.id} node={node}/>):<div className="bento-empty"><p>No matching records were returned by the graph.</p></div>}</div>:!loaded?<div className="bento-loading"><span className="spinner"/>Loading graph signals…</div>:<>
          {unownedServices.length>0&&<div className="bento-signal"><span className="bento-signal-icon"><Server size={14}/></span><div><b>{unownedServices.length} service{unownedServices.length===1?"":"s"} without recorded ownership</b><small>No owner or maintainer relationship is present in the loaded graph.</small>{unownedServices.slice(0,3).map(node=><RecordLink key={node.id} node={node}/>)}</div></div>}
          {!unownedServices.length&&<div className="bento-empty"><Sparkles size={17}/><b>No graph signals to review</b><p>This is based on indexed records; no investigations or inferred risks are fabricated.</p></div>}
          <div className="bento-card-footnote">Graph checks only · not a simulation</div>
        </>}
      </section>

      <section className="bento-card bento-activity-card" id="conversations">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Activity size={12}/> Latest records</span><h2>Recent activity</h2><p>Latest timestamped activity in the graph</p></div></div>
        <div className="bento-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading records…</div>:latestActivity.length?latestActivity.map(node=><div className="bento-event" key={node.id}><span className="bento-event-time">{relativeDate(recordTime(node))}</span><RecordLink node={node}/></div>):<div className="bento-empty"><Activity size={16}/><p>No activity records are indexed yet.</p></div>}</div>
      </section>

      <section className="bento-card bento-investigations-card">
        <div className="bento-card-heading"><div><span className="bento-kicker"><CircleAlert size={12}/> Incident records</span><h2>Open incidents</h2><p>Incident records indexed in the company graph</p></div></div>
        <div className="bento-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading incidents…</div>:incidents.length?incidents.slice(0,3).map(node=><RecordLink key={node.id} node={node}/>):<div className="bento-empty"><CircleAlert size={16}/><p>No open incident records were returned.</p></div>}</div>
      </section>

      <section className="bento-card bento-decisions-card" id="decisions">
        <div className="bento-card-heading"><div><span className="bento-kicker"><FileText size={12}/> Evidence trail</span><h2>Recent decisions</h2><p>Decision records and linked source documents</p></div></div>
        <div className="bento-list" id="documents">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading decisions…</div>:decisions.length?decisions.slice(0,4).map(node=>{const evidenceId=String(node.properties.documentId??"");const evidence=combinedNodes.find(item=>item.id===evidenceId);return <div className="bento-decision" key={node.id}><span className="bento-event-time">{relativeDate(recordTime(node))}</span><RecordLink node={node}/>{evidence&&<RecordLink node={evidence}>Source · {recordTitle(evidence)}</RecordLink>}</div>}):<div className="bento-empty"><FileText size={16}/><p>No decision records were returned.</p></div>}</div>
      </section>

      <section className="bento-card bento-ownership-card">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Building2 size={12}/> Service map</span><h2>Service ownership</h2><p>Owners are shown only when the graph records a relation.</p></div></div>
        <div className="bento-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading services…</div>:services.length?services.slice(0,5).map(service=>{const edge=combinedEdges.find(item=>["MAINTAINS","OWNS","OWNED_BY","OWNED"].includes(item.type)&&[item.source,item.target].includes(service.id));const otherId=edge?(edge.source===service.id?edge.target:edge.source):String(service.properties.teamId??service.properties.ownerId??"");const owner=combinedNodes.find(item=>item.id===otherId);return <div className="bento-owner-row" key={service.id}><RecordLink node={service}>{recordTitle(service)} · {String(service.properties.status??"health not recorded")}</RecordLink>{owner?<RecordLink node={owner}>{recordTitle(owner)} · {edge?.type??"recorded owner"}</RecordLink>:<span className="bento-unverified">No recorded owner</span>}</div>}):<div className="bento-empty"><Server size={16}/><p>No services are indexed.</p></div>}</div>
      </section>

      <section className="bento-card bento-timeline-card">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Clock3 size={12}/> Company history</span><h2>Timeline of key events</h2><p>Chronology uses timestamps present on graph records.</p></div></div>
        <div className="bento-list bento-timeline-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading timeline…</div>:timeline.length?timeline.slice(0,6).map(node=><div className="bento-event" key={`${node.id}:timeline`}><span className="bento-event-time">{relativeDate(recordTime(node))}</span><RecordLink node={node}/></div>):<div className="bento-empty"><Clock3 size={16}/><p>No dated decisions or events are indexed.</p></div>}</div>
      </section>

      <section className="bento-card bento-sources-card">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Plug size={12}/> Data connections</span><h2>Connected sources</h2><p>Counts reflect indexed source metadata. Sync runs through backend workflows.</p></div></div>
        <div className="bento-list">{sourceOptions.map(source=>{const count=combinedNodes.filter(node=>String(node.properties.sourceSystem??"").toLowerCase().includes(source.id)).length;const sync=syncResult[source.id];return <div className="bento-source-row" key={source.id}><Image src={source.image} alt="" width={27} height={27} className="bento-source-image"/><span className="bento-source-copy"><b>{source.label}</b><small>{!loaded?"Loading indexed count…":count?`${count} indexed records`:source.detail}</small>{sync?.error&&<small className="bento-source-error">{sync.error}</small>}{sync?.result&&<small className="bento-source-result">{sync.result.fetchedDocumentCount} fetched · {sync.result.outcomes.filter(item=>item.status==="processed").length} processed · {sync.result.errors.join(" ")||sync.result.status}</small>}</span><button className="bento-sync-button" type="button" onClick={()=>void syncSource(source.id)} disabled={syncing!==null} aria-label={`Sync ${source.label}`}>{syncing===source.id?<span className="spinner"/>:<RefreshCw size={12}/>}<span>{syncing===source.id?"Syncing":"Sync"}</span></button></div>})}</div>
        <Link className="bento-source-settings" href="/settings">Manage source workflows <ArrowUpRight size={12}/></Link>
      </section>
    </section>
  </>;
}
