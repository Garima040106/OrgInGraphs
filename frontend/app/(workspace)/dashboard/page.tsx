"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, ArrowUpRight, BookOpen, Building2, CircleAlert, Clock3, ExternalLink, FileText, GitPullRequest, MessagesSquare, Network, Plug, RefreshCw, Search, Server, Sparkles, UsersRound } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import { isProductGraphEntity } from "@/lib/graph/mode";
import { peopleSourceSummary } from "@/lib/source-data";
import { useLiveSourceData } from "@/lib/useLiveSourceData";
import type { DashboardResponse, Entity, GraphApiNode, GraphResponse, IntegrationSyncResponse, IngestionSource } from "@/lib/types";

type GraphState = { data: GraphResponse; loading: boolean; error: string };
type EntityFilter = { label: string; nodes: GraphApiNode[] } | null;
const emptyGraph: GraphResponse = { nodes: [], edges: [] };
const productTypes = new Set(["Product","ProductModule","Feature","FeatureRequest","Ticket","Bug","Release","PullRequest","Commit","Comment","Activity","Review","Task"]);
const sourceOptions: Array<{ id: IngestionSource; label: string; detail: string; image: string }> = [
  { id: "confluence", label: "Confluence", detail: "Live indexed records", image: "/img/confluence.png" },
  { id: "jira", label: "Jira", detail: "Seeded mock data", image: "/img/jira.webp" },
  { id: "github", label: "GitHub", detail: "Seeded mock data", image: "/img/github.png" },
  { id: "slack", label: "Slack", detail: "Seeded mock data", image: "/img/slack.png" },
];
const integrationCards = [
  { id: "confluence", label: "Confluence", detail: "Documentation & knowledge", image: "/img/confluence.png", href: "/documents", kind: "source" as const },
  { id: "jira", label: "Jira", detail: "Seeded mock issues", image: "/img/jira.webp", href: "/tickets", kind: "source" as const },
  { id: "slack", label: "Slack", detail: "Seeded mock messages", image: "/img/slack.png", href: "/conversations", kind: "source" as const },
  { id: "github", label: "GitHub", detail: "Seeded mock code records", image: "/img/github.png", href: "/proactive-insights", kind: "source" as const },
  { id: "people", label: "People Directory", detail: "Company & team information", image: "", href: "/people", kind: "people" as const },
];
const activityFilters = ["All", "Confluence", "Jira", "Slack", "GitHub", "People"] as const;
const knowledgeFilters = ["All", "Documents", "Issues", "Messages", "Code", "People"] as const;

function typeOf(node: GraphApiNode) { return node.labels.find((label) => productTypes.has(label)) ?? node.labels[0] ?? "Unknown"; }
function isRealLiveSourceRecord(node: GraphApiNode) {
  const source=String(node.properties.sourceSystem??"").toLowerCase();
  if(!source)return true;
  if(["confluence","jira","slack","github"].includes(source))return node.properties.provenance==="mock-verified"||(node.properties.synthetic!==true&&["external-verified","user-provided"].includes(String(node.properties.provenance??"")));
  return true;
}
function isVerifiedProviderRecord(node: GraphApiNode) {
  const source = String(node.properties.sourceSystem ?? "").toLowerCase();
  if (!["confluence", "jira", "slack", "github"].includes(source)) return true;
  return node.properties.provenance === "mock-verified"
    || (node.properties.synthetic !== true && ["external-verified", "user-provided"].includes(String(node.properties.provenance ?? "")));
}
function recordTitle(node: GraphApiNode) { const value = node.properties.name ?? node.properties.title ?? node.properties.key ?? node.id; return typeof value === "string" ? value : node.id; }
function recordTime(node: GraphApiNode) { return [node.properties.occurredAt,node.properties.validFrom,node.properties.mergedAt,node.properties.updatedAt,node.properties.createdAt].find((value) => typeof value === "string") as string | undefined; }
function recordPath(node: GraphApiNode) {
  const type=typeOf(node);const id=encodeURIComponent(node.id);
  const graphMode=isProductGraphEntity(type,node.properties.graphDomain)?"product":"team";
  const documentParams=type==="Document"?`&from=documents&sourceId=${encodeURIComponent(String(node.properties.sourceRecordId??node.id))}&sourceSystem=${encodeURIComponent(String(node.properties.sourceSystem??"confluence"))}`:"";
  return `/org-graph?mode=${graphMode}&focus=${id}&type=${encodeURIComponent(type)}${documentParams}`;
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
  const [dashboardStats,setDashboardStats]=useState<Pick<DashboardResponse,"totals">|null>(null);
  const [filter,setFilter]=useState<EntityFilter>(null);
  const [syncing,setSyncing]=useState<IngestionSource|null>(null);
  const [syncResult,setSyncResult]=useState<Partial<Record<IngestionSource,{result?:IntegrationSyncResponse;error?:string}>>>({});
  const [activityFilter,setActivityFilter]=useState<(typeof activityFilters)[number]>("All");
  const [knowledgeFilter,setKnowledgeFilter]=useState<(typeof knowledgeFilters)[number]>("All");
  const [knowledgeQuery,setKnowledgeQuery]=useState("");
  const [refreshMessage,setRefreshMessage]=useState("");
  const { sources: liveSourceData, loading: liveSourcesLoading, refresh: refreshLiveSources } = useLiveSourceData(false);
  const loadDashboard=useCallback(async(showSuccess=false)=>{if(showSuccess)setRefreshMessage("");setOrganization(previous=>({...previous,loading:true,error:""}));setProduct(previous=>({...previous,loading:true,error:""}));try{const [result,sourceCountsAvailable]=await Promise.all([api.dashboard(),refreshLiveSources()]);setDashboardStats({totals:result.totals});setOrganization({data:result.organization,loading:false,error:""});setProduct({data:result.productProgress,loading:false,error:""});if(showSuccess)setRefreshMessage(sourceCountsAvailable?"Dashboard graph and live source counts refreshed.":"Dashboard graph refreshed; one or more live source counts are unavailable.");}catch(error){const message=friendlyApiError(error);setOrganization(previous=>({...previous,loading:false,error:message}));setProduct(previous=>({...previous,loading:false,error:message}));}},[refreshLiveSources]);
  async function syncSource(source:IngestionSource){setSyncing(source);setSyncResult(previous=>({...previous,[source]:{}}));try{const result=await api.syncIntegration(source);setSyncResult(previous=>({...previous,[source]:{result}}));void loadDashboard();}catch(error){setSyncResult(previous=>({...previous,[source]:{error:friendlyApiError(error)}}));}finally{setSyncing(null);}}

  useEffect(()=>{void loadDashboard();},[loadDashboard]);
  const combinedNodes=useMemo(()=>[...new Map([...organization.data.nodes,...product.data.nodes].map(node=>[node.id,node])).values()], [organization.data.nodes,product.data.nodes]);
  const nodeIds=useMemo(()=>new Set(combinedNodes.map(node=>node.id)),[combinedNodes]);
  const combinedEdges=useMemo(()=>[...organization.data.edges,...product.data.edges].filter(edge=>nodeIds.has(edge.source)&&nodeIds.has(edge.target)), [organization.data.edges,product.data.edges,nodeIds]);
  const loaded=!organization.loading&&!product.loading;
  const decisions=useMemo(()=>combinedNodes.filter(node=>typeOf(node)==="Decision").sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const incidents=useMemo(()=>combinedNodes.filter(node=>typeOf(node)==="Incident"&&node.properties.resolvedAt==null&&!/resolved|closed|complete/i.test(String(node.properties.status??""))),[combinedNodes]);
  const activities=useMemo(()=>combinedNodes.filter(node=>isRealLiveSourceRecord(node)&&["Activity","PullRequest","Incident","Task","Ticket","Bug","Message","Commit","Release","Employee","Team"].includes(typeOf(node))&&recordTime(node)).sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const timeline=useMemo(()=>combinedNodes.filter(node=>isRealLiveSourceRecord(node)&&["Decision","Incident","Activity","PullRequest","Release","Commit","Document"].includes(typeOf(node))&&recordTime(node)).sort((a,b)=>Date.parse(recordTime(b)??"")-Date.parse(recordTime(a)??"")),[combinedNodes]);
  const teams=combinedNodes.filter(node=>typeOf(node)==="Team");
  const people=combinedNodes.filter(node=>typeOf(node)==="Employee");
  const projects=combinedNodes.filter(node=>["Project","Service","Product","ProductModule"].includes(typeOf(node)));
  const services=combinedNodes.filter(node=>typeOf(node)==="Service");
  const unownedServices=services.filter(service=>{
    const hasOwner=combinedEdges.some(edge=>["MAINTAINS","OWNS","OWNED_BY","OWNED"].includes(edge.type)&&[edge.source,edge.target].includes(service.id));
    return !hasOwner&&!service.properties.teamId&&!service.properties.ownerId;
  });
  const metricsLoading=!loaded||dashboardStats===null||liveSourcesLoading;
  const sourceSummary=(id:"confluence"|"github"|"jira"|"slack")=>liveSourceData[id];
  const visibleActivity=activities.filter(node=>{
    if(activityFilter==="All")return true;
    if(activityFilter==="People")return ["Employee","Team"].includes(typeOf(node));
    const source=String(node.properties.sourceSystem??"").toLowerCase();
    return source.includes(activityFilter.toLowerCase());
  }).slice(0,8);
  const knowledgeRecords=combinedNodes.filter(node=>{
    if(!isVerifiedProviderRecord(node))return false;
    const type=typeOf(node);
    const categoryMatch=knowledgeFilter==="All"||
      (knowledgeFilter==="Documents"&&["Document","Decision"].includes(type))||
      (knowledgeFilter==="Issues"&&["Ticket","Bug"].includes(type))||
      (knowledgeFilter==="Messages"&&["Message","Channel"].includes(type))||
      (knowledgeFilter==="Code"&&["PullRequest","Commit","Repository"].includes(type))||
      (knowledgeFilter==="People"&&["Employee","Team"].includes(type));
    const term=knowledgeQuery.trim().toLowerCase();
    const matchesQuery=!term||[recordTitle(node),node.properties.description,node.properties.summary,node.properties.content]
      .some(value=>typeof value==="string"&&value.toLowerCase().includes(term));
    return categoryMatch&&matchesQuery;
  }).slice(0,8);
  const apiFailures=organization.error?[{label:"Dashboard data",error:organization.error,retry:()=>loadDashboard()}]:[];

  return <>
    <div className="page-heading dashboard-bento-heading" id="company-intelligence">
      <div className="dashboard-heading-copy"><div className="eyebrow"><span className="eyebrow-mark"/> Company intelligence</div><h1>Company Intelligence Hub</h1><p>Unified knowledge from your tools, people, and projects — all in one place.</p></div>
      <div className="heading-actions"><button className="small-button" type="button" onClick={()=>void loadDashboard(true)} disabled={organization.loading||product.loading||liveSourcesLoading}><RefreshCw size={12} className={organization.loading||product.loading||liveSourcesLoading?"source-spin":""}/> Refresh data</button><Link className="small-button primary-action" href="/integrations"><Plug size={12}/> Connect source</Link></div>
    </div>
    {refreshMessage&&<div className="source-library-success" role="status">{refreshMessage}</div>}
    {apiFailures.map(item=><div className="bento-api-alert" role="alert" key={item.label}><CircleAlert size={14}/><span><b>{item.label} unavailable.</b> {item.error}</span><button className="small-button" type="button" onClick={item.retry}>Retry</button></div>)}

    <section className="hub-integrations" aria-label="Connected company sources" aria-busy={metricsLoading}>
      {integrationCards.map((source)=>{
        const sourceData=source.kind==="people"?peopleSourceSummary(dashboardStats?.totals.people??null):sourceSummary(source.id as "confluence"|"github"|"jira"|"slack");
        const count=sourceData.totalAvailableRecords;
        const nodes=people;
        const sync=source.kind==="source"?syncResult[source.id as IngestionSource]:undefined;
        return <article className="hub-integration-card" key={source.id}>
          <div className="hub-integration-top"><span className="hub-integration-logo">{source.image?<Image src={source.image} alt="" width={30} height={30}/>:<UsersRound size={22}/>}</span><span className="hub-integration-copy"><b>{source.label}</b><small>{source.detail}</small></span><details className="hub-integration-menu"><summary aria-label={`${source.label} actions`}>•••</summary><div><Link href={source.href}>View data</Link>{source.kind==="source"&&<button type="button" disabled={syncing!==null} onClick={()=>void syncSource(source.id as IngestionSource)}>{syncing===source.id?"Syncing…":"Sync now"}</button>}<Link href="/integrations">Manage source</Link></div></details></div>
          <p className="hub-indexed-count">{(source.kind==="people"?(!loaded||dashboardStats===null):liveSourcesLoading)?"Loading source count…":count===null?sourceData?.error??"Count unavailable":source.kind==="people"?`${count.toLocaleString()} employees in company graph`:sourceData.dataMode==="demo"?`${count.toLocaleString()} indexed mock records`:`${count.toLocaleString()} verified indexed records`}</p>
          <p className="hub-sync-time">{syncing===source.id?"Backend sync in progress":sync?.error?`Sync failed: ${sync.error}`:sync?.result?`${sync.result.fetched} fetched · ${sync.result.processed} processed · ${sync.result.failed} failed`:sourceData.lastSyncTime?`Last successful sync ${new Date(sourceData.lastSyncTime).toLocaleString()}`:"Last successful sync unavailable"}</p>
          {sync?.result?.error&&<p className="hub-sync-error">{sync.result.error}</p>}
          <div className="hub-integration-actions">{source.kind==="people"?<button type="button" onClick={()=>setFilter({label:`${source.label} records`,nodes})}>View records <ArrowRight size={13}/></button>:<Link href={source.href}>View records <ArrowRight size={13}/></Link>}</div>
        </article>;
      })}
    </section>

    <section className="bento-grid" aria-label="Company intelligence dashboard" aria-busy={!loaded}>
      <section className="bento-card bento-insights-card" id="insights">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Sparkles size={12}/> Evidence signals</span><h2>{filter?.label??"Proactive insights"}</h2><p>{filter?`${filter.nodes.length} matching graph records`:"Deterministic checks from indexed company data"}</p></div>{filter&&<button className="bento-text-button" type="button" onClick={()=>setFilter(null)}>Clear</button>}</div>
        {filter?<div className="bento-list">{filter.nodes.length?filter.nodes.map(node=><RecordLink key={node.id} node={node}/>):<div className="bento-empty"><p>No matching records were returned by the graph.</p></div>}</div>:!loaded?<div className="bento-loading"><span className="spinner"/>Loading graph signals…</div>:<>
          {unownedServices.length>0&&<div className="bento-signal"><span className="bento-signal-icon"><Server size={14}/></span><div><b>{unownedServices.length} service{unownedServices.length===1?"":"s"} without recorded ownership</b><small>No owner or maintainer relationship is present in the loaded graph.</small>{unownedServices.slice(0,3).map(node=><RecordLink key={node.id} node={node}/>)}</div></div>}
          {!unownedServices.length&&<div className="bento-empty"><Sparkles size={17}/><b>No graph signals to review</b><p>This is based on indexed records; no investigations or inferred risks are fabricated.</p></div>}
          <div className="bento-card-footnote">Graph checks only · not a simulation</div>
        </>}
      </section>

      <section className="bento-card bento-activity-card" id="conversations">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Activity size={12}/> Recent activity</span><h2>Latest company updates</h2><p>Indexed live and seeded mock records from connected sources.</p></div><Link className="bento-text-button" href="/conversations">View all <ArrowRight size={12}/></Link></div>
        <div className="hub-filter-tabs" role="group" aria-label="Filter recent activity">{activityFilters.map(item=><button type="button" key={item} className={activityFilter===item?"active":""} aria-pressed={activityFilter===item} onClick={()=>setActivityFilter(item)}>{item}</button>)}</div>
        <div className="bento-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading records…</div>:visibleActivity.length?visibleActivity.map(node=><div className="bento-event" key={node.id}><span className="hub-record-type-icon">{sourceOptions.find(source=>String(node.properties.sourceSystem??"").toLowerCase().includes(source.id))?<Image src={sourceOptions.find(source=>String(node.properties.sourceSystem??"").toLowerCase().includes(source.id))!.image} alt="" width={24} height={24}/>:<Activity size={14}/>}</span><span className="bento-event-main"><RecordLink node={node}/>{node.properties.provenance==="mock-verified"&&<small className="mock-source-label">Mock demo record</small>}<small>{String(node.properties.description??node.properties.summary??node.properties.projectName??typeOf(node))}</small></span><span className="bento-event-time">{relativeDate(recordTime(node))}</span></div>):<div className="bento-empty"><Activity size={16}/><p>{activityFilter==="All"?"No timestamped indexed activity records are available.":`No ${activityFilter} indexed activity records were returned.`}</p></div>}</div>
      </section>

      <section className="bento-card hub-quick-insights">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Sparkles size={12}/> Quick insights</span><h2>Source record totals</h2><p>Counts come from the indexed graph; seeded mock sources are labeled as demo data.</p></div></div>
        <div className="hub-insight-grid">{integrationCards.map(source=>{const info=source.kind==="people"?peopleSourceSummary(dashboardStats?.totals.people??null):sourceSummary(source.id as "confluence"|"github"|"jira"|"slack");const count=info.verifiedIndexedRecordCount??info.totalAvailableRecords;const loadingCount=source.kind==="people"?(!loaded||dashboardStats===null):info.dataMode==="live"&&liveSourcesLoading;return <div className="hub-insight-item" key={source.id}>{source.image?<Image src={source.image} alt="" width={22} height={22}/>:<UsersRound size={20}/>}<b>{loadingCount||count===null?"—":count.toLocaleString()}</b><span>{source.label} {source.kind==="people"?"employees in graph":info.dataMode==="demo"?"demo records":"verified indexed"}</span></div>})}</div>
      </section>

      <section className="bento-card hub-top-teams">
        <div className="bento-card-heading"><div><span className="bento-kicker"><UsersRound size={12}/> Top teams</span><h2>Teams in your graph</h2><p>Member counts use recorded graph relationships</p></div><Link className="bento-text-button" href="/people">View all <ArrowRight size={12}/></Link></div>
        <div className="hub-compact-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading teams…</div>:teams.length?teams.slice(0,4).map(team=>{const memberCount=combinedEdges.filter(edge=>[edge.source,edge.target].includes(team.id)&&combinedNodes.some(node=>node.id===(edge.source===team.id?edge.target:edge.source)&&typeOf(node)==="Employee")).length;return <Link className="hub-team-row" href="/people" key={team.id}><span className="hub-team-icon"><UsersRound size={15}/></span><span><b>{recordTitle(team)}</b><small>{typeof team.properties.memberCount==="number"?team.properties.memberCount:memberCount} members</small></span><ArrowUpRight size={13}/></Link>}):<div className="bento-empty"><UsersRound size={16}/><p>No team records are indexed.</p></div>}</div>
      </section>

      <section className="bento-card hub-ongoing-work">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Building2 size={12}/> Ongoing work</span><h2>Projects & services</h2><p>Current records and statuses from the company graph</p></div><Link className="bento-text-button" href="/projects">View all <ArrowRight size={12}/></Link></div>
        <div className="hub-compact-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading work…</div>:projects.length?projects.slice(0,5).map(project=><div className="hub-work-row" key={project.id}><span className="hub-work-icon"><Building2 size={15}/></span><span><RecordLink node={project}/><small>{String(project.properties.teamName??project.properties.departmentName??"Team not recorded")}</small></span><span className="hub-status-badge">{String(project.properties.status??"Status unavailable")}</span></div>):<div className="bento-empty"><Building2 size={16}/><p>No project or service records are indexed.</p></div>}</div>
      </section>

      <section className="bento-card hub-knowledge-explorer">
        <div className="bento-card-heading"><div><span className="bento-kicker"><Search size={12}/> Knowledge explorer</span><h2>Company records</h2><p>Search and filter indexed knowledge</p></div><Link className="bento-text-button" href="/documents">View all <ArrowRight size={12}/></Link></div>
        <label className="hub-knowledge-search"><Search size={14}/><input value={knowledgeQuery} onChange={event=>setKnowledgeQuery(event.target.value)} placeholder="Search titles and summaries" aria-label="Search company records"/></label>
        <div className="hub-filter-tabs hub-knowledge-tabs" role="group" aria-label="Filter company records">{knowledgeFilters.map(item=><button type="button" key={item} className={knowledgeFilter===item?"active":""} aria-pressed={knowledgeFilter===item} onClick={()=>setKnowledgeFilter(item)}>{item}</button>)}</div>
        <div className="hub-knowledge-list">{!loaded?<div className="bento-loading"><span className="spinner"/>Loading records…</div>:knowledgeRecords.length?knowledgeRecords.map(node=><div className="hub-knowledge-row" key={node.id}><span className="hub-record-type-icon">{typeOf(node)==="Employee"||typeOf(node)==="Team"?<UsersRound size={14}/>:typeOf(node)==="Ticket"||typeOf(node)==="Bug"?<CircleAlert size={14}/>:typeOf(node)==="PullRequest"||typeOf(node)==="Commit"?<GitPullRequest size={14}/>:typeOf(node)==="Message"||typeOf(node)==="Channel"?<MessagesSquare size={14}/>:<FileText size={14}/>}</span><span className="hub-knowledge-copy"><RecordLink node={node}/>{node.properties.provenance==="mock-verified"&&<small className="mock-source-label">Mock demo record</small>}<small>{String(node.properties.description??node.properties.summary??node.properties.sourceSystem??typeOf(node))}</small></span><time>{relativeDate(recordTime(node))}</time></div>):<div className="bento-empty"><BookOpen size={16}/><p>No matching indexed records.</p></div>}</div>
      </section>

      <section className="bento-card hub-featured-knowledge">
        <div className="bento-card-heading"><div><span className="bento-kicker"><BookOpen size={12}/> Featured knowledge</span><h2>Explore by topic</h2><p>Shortcuts to existing company views</p></div><Link className="bento-text-button" href="/documents">View all <ArrowRight size={12}/></Link></div>
        <div className="hub-feature-grid">{[
          {label:"Runbooks",detail:`${combinedNodes.filter(node=>/runbook/i.test(recordTitle(node))).length} matching records`,icon:BookOpen,href:"/documents"},
          {label:"Active incidents",detail:`${incidents.length} indexed`,icon:CircleAlert,href:"/tickets"},
          {label:"System architecture",detail:`${combinedNodes.filter(node=>/architect/i.test(recordTitle(node))).length} matching records`,icon:Network,href:"/documents"},
          {label:"Team directory",detail:`${people.length} people · ${teams.length} teams`,icon:UsersRound,href:"/people"},
        ].map(tile=><Link className="hub-feature-tile" href={tile.href} key={tile.label}><tile.icon size={19}/><b>{tile.label}</b><small>{tile.detail}</small></Link>)}</div>
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
        <div className="bento-card-heading"><div><span className="bento-kicker"><Plug size={12}/> Data connections</span><h2>Connected sources</h2><p>Backend counts distinguish the live Confluence provider from seeded mock integrations.</p></div></div>
        <div className="bento-list">{sourceOptions.map(source=>{const info=sourceSummary(source.id);const count=info.verifiedIndexedRecordCount??info.totalAvailableRecords;const sync=syncResult[source.id];return <div className="bento-source-row" key={source.id}><Image src={source.image} alt="" width={27} height={27} className="bento-source-image"/><span className="bento-source-copy"><b>{source.label}</b><small>{liveSourcesLoading?"Checking source…":count===null?info.error??"Count unavailable":`${count} verified indexed records · ${info.connectionState}`}</small>{sync?.error&&<small className="bento-source-error">{sync.error}</small>}{sync?.result&&<small className="bento-source-result">{sync.result.fetched} fetched · {sync.result.processed} processed · {sync.result.indexed} indexed · {sync.result.failed} failed</small>}</span><button className="bento-sync-button" type="button" onClick={()=>void syncSource(source.id)} disabled={syncing!==null} aria-label={`Sync ${source.label}`}>{syncing===source.id?<span className="spinner"/>:<RefreshCw size={12}/>}<span>{syncing===source.id?"Syncing":"Sync"}</span></button></div>})}</div>
        <Link className="bento-source-settings" href="/settings">Manage source workflows <ArrowUpRight size={12}/></Link>
      </section>
    </section>
  </>;
}
