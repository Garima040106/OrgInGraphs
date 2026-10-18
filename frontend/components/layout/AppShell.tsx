"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  CircleHelp,
  Command,
  Home,
  SearchCheck,
  Search,
  ChartNoAxesCombined,
  Network,
  FileText,
  CircleAlert,
  MessagesSquare,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { CompanyAssistant } from "@/components/assistant/CompanyAssistant";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { api } from "@/lib/api";
import type { Entity, GraphEntityType, Health } from "@/lib/types";

const navigation = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/org-graph", label: "Knowledge Graph", icon: Network },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/people", label: "People", icon: UsersRound },
  { href: "assistant", label: "RAG Assistant", icon: SearchCheck, action: true },
  { href: "search", label: "Search", icon: Search, action: true },
  { href: "/impact-analysis", label: "Impact Analysis", icon: ChartNoAxesCombined },
  { href: "/documents", label: "Documents", icon: FileText, group: "tools" },
  { href: "/tickets", label: "Tickets", icon: CircleAlert, group: "tools" },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare, group: "tools" },
  { href: "/sync-data", label: "Sync & Data", icon: RefreshCw, group: "tools" },
];

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [workspace, setWorkspace] = useState("demo@hirenova.com");
  const [company, setCompany] = useState("Company workspace");
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<{ entity: Entity; entityType: GraphEntityType | "Unknown" } | null>(null);
  const hasHirenovaLogo = company.trim().toLowerCase().startsWith("hirenova");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const email = window.localStorage.getItem("oig-demo-workspace");
    setWorkspace(email ?? "demo@hirenova.com");
    setSidebarCollapsed(window.localStorage.getItem("oig-sidebar-collapsed") === "true");
    let mounted = true;
    api.company().then((item) => { if (mounted) setCompany(String(item.name ?? "Company workspace")); }).catch(() => { if (mounted) setCompany("Company workspace"); });
    api.health().then((item) => { if (mounted) setHealth(item); }).catch(() => { if (mounted) setHealth({ status: "degraded", database: "unavailable" }); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title =
    pathname.startsWith("/people") ? "People" :
      pathname.startsWith("/departments") ? "Departments" :
        pathname.startsWith("/projects") ? "Projects" :
          pathname === "/impact-analysis" ? "Impact Analysis" :
            pathname === "/documents" ? "Documents" :
              pathname === "/tickets" ? "Tickets" :
                pathname === "/conversations" ? "Conversations" :
                  pathname === "/integrations" ? "Integrations" :
                    pathname === "/sync-data" ? "Sync & Data" :
                        pathname === "/proactive-insights" ? "Proactive Insights" :
          pathname === "/settings" ? "Workspace settings" :
          pathname === "/dashboard" ? "Overview" :
          pathname === "/org-graph" ? "Organization graph" : "Workspace";
  const connection = health?.status === "ok";
  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem("oig-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className={`app-shell ${assistantOpen ? "assistant-open" : ""} ${pathname === "/dashboard" ? "dashboard-route" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`} data-lenis-prevent>
        <div className="sidebar-brand-row"><Brand href="/dashboard" compact={sidebarCollapsed} showMark={false} /><button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
        <div className="sidebar-kicker">{company}</div>
        <button className="workspace-switch" type="button" aria-label={`${company} workspace`}>
          <span className={`workspace-mark ${hasHirenovaLogo ? "workspace-mark-logo" : ""}`}>
            {hasHirenovaLogo ? <Image src="/img/HirenovaLogo.png" alt="" width={36} height={36} /> : company.slice(0, 1).toUpperCase()}
          </span>
          <span><b>{company}</b><small>Company workspace</small></span><ChevronDown size={13} />
        </button>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation.filter((item) => !item.group).map(({ href, label, icon: Icon }) => {
            const isAction = href === "assistant" || href === "search";
            const target = href.split("#")[0];
            const active = !isAction && (href === "/dashboard"
              ? pathname === "/dashboard"
              : !href.includes("#") && (pathname === target || pathname.startsWith(`${target}/`)));
            if (isAction) return <button type="button" className="side-nav-action" key={label} title={sidebarCollapsed ? label : undefined} aria-label={label} onClick={() => href === "search" ? setSearchOpen(true) : setAssistantOpen(true)}><Icon size={15} /><span>{label}</span></button>;
            return <Link href={href} className={active ? "active" : ""} key={label} aria-current={active ? "page" : undefined} title={sidebarCollapsed ? label : undefined}><Icon size={15} /><span>{label}</span></Link>;
          })}
          <div className="side-nav-group"><div className="nav-section-label">TOOLS</div>{navigation.filter((item) => item.group === "tools").map(({ href, label, icon: Icon })=>{const active=pathname===href||pathname.startsWith(`${href}/`);return <Link href={href} className={active?"active":""} key={label} aria-current={active?"page":undefined} title={sidebarCollapsed ? label : undefined}><Icon size={15}/><span>{label}</span></Link>;})}</div>
        </nav>
        <div className="sidebar-bottom">
          <nav className="side-nav sidebar-settings-nav" aria-label="Preferences"><Link href="/settings" className={pathname === "/settings" ? "active" : ""} aria-current={pathname === "/settings" ? "page" : undefined} title={sidebarCollapsed ? "Settings" : undefined}><Settings2 size={15} /><span>Settings</span></Link></nav>
          <div className="sidebar-help"><CircleHelp size={14} /><span>Help center</span></div>
          <div className="sidebar-user"><span className="user-avatar">{workspace.slice(0, 2).toUpperCase()}</span><div><b title={workspace}>{workspace}</b><small>Demo access</small></div><ArrowDownUp size={13} color="#98a0af" /></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span className="breadcrumb-company">{company}</span><span className="breadcrumb-divider">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${connection ? "" : "offline"}`} title={connection ? "Backend connected" : "Backend unavailable"}><span className="status-dot" /><span>{connection ? "Connected" : health ? "Offline" : "Checking"}</span></div>
            <button className="search-trigger" type="button" onClick={() => setSearchOpen(true)}><Search size={13} /><span>Search across Confluence, Jira, Slack, GitHub, people, projects, and more...</span><kbd><Command size={9} /> K</kbd></button>
            <div className="topbar-user-profile"><span className="user-avatar">{workspace.slice(0, 1).toUpperCase()}</span><span><b>{workspace}</b><small>Workspace member</small></span></div>
          </div>
        </header>
        <main className="workspace-content" data-lenis-prevent>{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <button className="assistant-launch" type="button" onClick={() => setAssistantOpen((open) => !open)} aria-label="Open OrgMind Assistant"><Sparkles size={14} /> OrgMind Assistant</button>
      <CompanyAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} selected={selected} />
      <SelectionSync onSelection={(value) => setSelected(value)} />
    </div>
  );
}

function SelectionSync({ onSelection }: { onSelection: (value: { entity: Entity; entityType: GraphEntityType | "Unknown" } | null) => void }) {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ entity: Entity; entityType: GraphEntityType | "Unknown" } | null>).detail;
      onSelection(detail);
    };
    window.addEventListener("oig-graph-selection", listener);
    return () => window.removeEventListener("oig-graph-selection", listener);
  }, [onSelection]);
  return null;
}
