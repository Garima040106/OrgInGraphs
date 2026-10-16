import { ArrowUpRight, Cable } from "lucide-react";

const integrations = [
  { name: "Confluence", detail: "Knowledge and documentation", status: "Connected · demo", connected: true },
  { name: "Slack", detail: "Team conversations", status: "Coming soon" },
  { name: "Jira", detail: "Issues and project delivery", status: "Coming soon" },
  { name: "GitHub", detail: "Repositories and pull requests", status: "Coming soon" },
  { name: "Discord", detail: "Community conversations", status: "Coming soon" },
];

export default function WorkspaceSettingsPage() {
  return (
    <section className="workspace-settings" aria-labelledby="workspace-settings-title">
      <div className="workspace-settings-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> Workspace</span>
          <h1 id="workspace-settings-title">Integrations</h1>
          <p>See which platforms are represented in your company graph.</p>
        </div>
        <span className="settings-demo-note">Demo connection status</span>
      </div>
      <div className="integration-settings-grid">
        {integrations.map(({ name, detail, status, connected }) => (
          <article className="integration-setting" key={name}>
            <div className="integration-setting-mark" aria-hidden="true"><Cable size={16} /></div>
            <div className="integration-setting-copy"><b>{name}</b><span>{detail}</span></div>
            <button className={`integration-setting-status ${connected ? "connected" : ""}`} type="button" disabled aria-label={`${name}: ${status}`}>
              {status}
            </button>
          </article>
        ))}
      </div>
      <div className="settings-source-note">
        <span>Each graph record displays its source. Demo records are stored in FalkorDB; external platform connections are not active.</span>
        <a href="/dashboard">Return to organization graph <ArrowUpRight size={13} /></a>
      </div>
    </section>
  );
}
