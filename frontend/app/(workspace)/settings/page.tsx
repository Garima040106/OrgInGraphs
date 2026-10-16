"use client";

import { ArrowUpRight, Plug, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Types
type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

interface Integration {
  id: string;
  name: string;
  detail: string;
  logo: string;
  logoAlt: string;
}

// Data
const INTEGRATIONS: Integration[] = [
  { id: "confluence", name: "Confluence", detail: "Knowledge and documentation",    logo: "/img/confluence.png", logoAlt: "Confluence logo" },
  { id: "slack",      name: "Slack",      detail: "Team conversations",             logo: "/img/slack.png",      logoAlt: "Slack logo"      },
  { id: "jira",       name: "Jira",       detail: "Issues and project delivery",    logo: "/img/jira.webp",      logoAlt: "Jira logo"       },
  { id: "github",     name: "GitHub",     detail: "Repositories and pull requests", logo: "/img/github.png",     logoAlt: "GitHub logo"     },
  { id: "discord",    name: "Discord",    detail: "Community conversations",        logo: "/img/discord.jpg",    logoAlt: "Discord logo"    },
];

// localStorage helpers (safe for SSR)
const STORAGE_KEY = "orginGraphs_integration_states_v1";

function readStoredState(id: string): ConnectionState {
  if (typeof window === "undefined") return "disconnected";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "disconnected";
    const map = JSON.parse(raw) as Record<string, string>;
    const val = map[id];
    return val === "connected" || val === "disconnected" ? val : "disconnected";
  } catch {
    return "disconnected";
  }
}

function writeStoredState(id: string, state: ConnectionState) {
  if (state === "connecting" || state === "disconnecting") return;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[id] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// StatusBadge
function StatusBadge({ state }: { state: ConnectionState }) {
  let dotClass = "integration-status-dot";
  let label: string;

  switch (state) {
    case "connected":
      dotClass += " is-connected";
      label = "Connected \u00b7 Demo";
      break;
    case "connecting":
      dotClass += " is-busy";
      label = "Connecting\u2026";
      break;
    case "disconnecting":
      dotClass += " is-busy";
      label = "Disconnecting\u2026";
      break;
    default:
      label = "Disconnected";
  }

  return (
    <span className="integration-status-badge" aria-live="polite" aria-atomic="true">
      <span className={dotClass} aria-hidden="true" />
      {label}
    </span>
  );
}

// ActionButton
function ActionButton({
  integrationName,
  state,
  onClick,
}: {
  integrationName: string;
  state: ConnectionState;
  onClick: () => void;
}) {
  const isBusy = state === "connecting" || state === "disconnecting";
  const isDiscoStyle = state === "connected" || state === "disconnecting";
  const btnClass = isDiscoStyle
    ? "integration-action-btn is-disconnect"
    : "integration-action-btn is-connect";

  let label: string;
  let leading: React.ReactNode;

  if (state === "connecting") {
    label   = "Connecting\u2026";
    leading = <span className="integration-btn-spinner" aria-hidden="true" />;
  } else if (state === "disconnecting") {
    label   = "Disconnecting\u2026";
    leading = <span className="integration-btn-spinner" aria-hidden="true" />;
  } else if (state === "connected") {
    label   = "Disconnect";
    leading = <Unplug size={10} aria-hidden="true" />;
  } else {
    label   = "Connect";
    leading = <Plug size={10} aria-hidden="true" />;
  }

  return (
    <button
      id={`integration-${integrationName.toLowerCase()}-btn`}
      className={btnClass}
      type="button"
      disabled={isBusy}
      onClick={onClick}
      aria-label={`${integrationName}: ${label}`}
    >
      {leading}
      <span>{label}</span>
    </button>
  );
}

// IntegrationCard
function IntegrationCard({ integration }: { integration: Integration }) {
  const { id, name, detail, logo, logoAlt } = integration;

  // Server renders "disconnected" for all cards (no hydration mismatch).
  // After mount we restore from localStorage.
  const [state, setState]     = useState<ConnectionState>("disconnected");
  const [hydrated, setHydrated] = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState(readStoredState(id));
    setHydrated(true);
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredState(id, state);
  }, [id, state, hydrated]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (state === "disconnected") {
      setState("connecting");
      timerRef.current = setTimeout(
        () => setState("connected"),
        1000 + Math.random() * 600,
      );
    } else if (state === "connected") {
      setState("disconnecting");
      timerRef.current = setTimeout(
        () => setState("disconnected"),
        800 + Math.random() * 500,
      );
    }
  };

  return (
    <article className="integration-setting" aria-label={`${name} integration`}>
      <div className="integration-setting-logo" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={logoAlt} />
      </div>

      <div className="integration-setting-copy">
        <b>{name}</b>
        <span>{detail}</span>
        <StatusBadge state={state} />
      </div>

      <ActionButton integrationName={name} state={state} onClick={handleClick} />
    </article>
  );
}

// Page
export default function WorkspaceSettingsPage() {
  return (
    <section className="workspace-settings" aria-labelledby="workspace-settings-title">
      <div className="workspace-settings-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> Workspace</span>
          <h1 id="workspace-settings-title">Integrations</h1>
          <p>See which platforms are represented in your company graph.</p>
        </div>
        <span className="settings-demo-note">Demo mode \u2014 connections are simulated</span>
      </div>

      <div className="integration-settings-grid">
        {INTEGRATIONS.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>

      <div className="settings-source-note">
        <span>
          Each graph record displays its source. Demo records are stored in
          FalkorDB; external platform connections are not active.
        </span>
        <a href="/dashboard">
          Return to organization graph <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}