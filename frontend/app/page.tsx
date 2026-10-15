import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Network,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/Brand";

function GraphPreview() {
  return (
    <div className="hero-visual" aria-label="Illustration of a connected company graph">
      <div className="visual-toolbar">
        <span className="toolbar-dots"><i /><i /><i /></span>
        <span className="visual-label"><span className="status-dot" /> Organization graph</span>
        <span className="visual-chip">Illustration</span>
      </div>
      <div className="graph-preview">
        <svg className="graph-lines" viewBox="0 0 760 420" role="presentation">
          <path d="M372 191 C300 145 230 118 162 94" />
          <path d="M394 194 C466 144 527 122 601 105" />
          <path d="M368 215 C286 250 243 296 174 330" />
          <path d="M404 217 C481 247 532 287 610 328" />
          <path d="M165 94 C146 158 151 247 174 330" />
          <path d="M601 105 C619 170 623 245 610 328" />
          <path d="M163 94 C278 65 481 63 601 105" />
          <path d="M174 330 C310 362 479 363 610 328" />
          <path d="M248 148 C284 173 317 187 365 197" />
          <path d="M515 150 C474 172 446 185 405 197" />
          <path d="M255 274 C302 245 328 229 368 213" />
          <path d="M514 274 C474 247 443 227 405 213" />
        </svg>
        <div className="preview-node node-company"><span className="company-glyph">H</span><span><b>Hirenova</b><small>Company</small></span><span className="node-menu">···</span></div>
        <div className="preview-node node-person node-person-a"><span className="avatar avatar-lilac">AP</span><span><b>Ava Patel</b><small>Engineering</small></span></div>
        <div className="preview-node node-person node-person-b"><span className="avatar avatar-mint">NC</span><span><b>Noah Chen</b><small>Product</small></span></div>
        <div className="preview-node node-person node-person-c"><span className="avatar avatar-peach">MR</span><span><b>Mia Rivera</b><small>Design</small></span></div>
        <div className="preview-node node-person node-person-d"><span className="avatar avatar-blue">JL</span><span><b>Jonah Lee</b><small>Infrastructure</small></span></div>
        <div className="preview-node node-project"><span className="project-glyph"><Network size={14} /></span><span><b>Payments API</b><small>Project · active</small></span></div>
        <div className="preview-node node-department"><span className="department-glyph"><UsersRound size={14} /></span><span><b>Software Eng.</b><small>Department</small></span></div>
        <div className="graph-callout"><span className="callout-line" /><span>Shared context,<br />one click away.</span></div>
      </div>
      <div className="visual-footer"><span>People, projects, decisions — connected.</span><span><span className="legend-dot blue" /> People <span className="legend-dot violet" /> Teams <span className="legend-dot amber" /> Projects</span></div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <header className="marketing-nav">
        <Brand />
        <nav className="marketing-links"><a href="#product">Product</a><a href="#why-oig">Why OIG</a></nav>
        <div className="nav-actions"><Link className="nav-login" href="/login">Sign in</Link><Link className="button button-dark button-small" href="/login">Open workspace <ArrowRight size={14} /></Link></div>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Organizational intelligence</div>
          <h1>Fasten up your<br /><span>employee onboarding.</span></h1>
          <p>Connect people, projects, teams, and decisions into one living company graph. Give every employee the context they need to contribute from day one.</p>
          <div className="hero-actions"><Link href="/login" className="button button-primary">Explore your organization <ArrowRight size={16} /></Link><a href="#product" className="button button-quiet">See how it works <ArrowDownRight size={16} /></a></div>
          <div className="hero-proof"><span className="proof-avatars"><i>AP</i><i>NC</i><i>MR</i><i>+</i></span><span>Company knowledge, connected.</span></div>
        </div>
        <GraphPreview />
        <div className="hero-footnote"><span>01 — A clearer picture of how work gets done</span><span>Built for teams that move fast <ArrowUpRight size={13} /></span></div>
      </section>

      <section className="statement-section" id="why-oig">
        <div className="section-kicker">THE CONTEXT GAP</div>
        <div className="statement-content"><h2>Great work shouldn’t depend on<br />knowing who to ask.</h2><div><p>Company knowledge is everywhere. OIG brings it together, so people can find the people, projects, and decisions behind the work.</p><a className="text-link" href="#product">Meet your company graph <ArrowRight size={14} /></a></div></div>
        <div className="statement-rule" />
        <div className="feature-grid" id="product">
          <article className="feature-card"><div className="feature-icon icon-blue"><Compass size={19} /></div><span className="feature-number">01 / EXPLORE</span><h3>See how the pieces connect.</h3><p>Move through a living map of people, teams, and projects. Follow the relationships that explain how work actually happens.</p><div className="feature-art feature-art-map"><span /><span /><span /><span /><i /><i /></div></article>
          <article className="feature-card"><div className="feature-icon icon-violet"><Search size={19} /></div><span className="feature-number">02 / DISCOVER</span><h3>Find the right person, faster.</h3><p>Search beyond titles. Find teammates by what they work on, what they know, and where they’re connected.</p><div className="feature-art feature-art-search"><span><Search size={14} /> idempotency</span><i>Ava Patel <small>Payments · Software Engineering</small></i></div></article>
          <article className="feature-card"><div className="feature-icon icon-amber"><Sparkles size={19} /></div><span className="feature-number">03 / UNDERSTAND</span><h3>Get the context behind the work.</h3><p>Open any profile or project to see the connections around it and build a fuller picture, one step at a time.</p><div className="feature-art feature-art-context"><span className="context-person">AP</span><div><b>Ledger reconciliation</b><small>Owned by Ava · 3 connections</small></div><ArrowUpRight size={14} /></div></article>
        </div>
      </section>

      <section className="closing-section"><div><span className="section-kicker">MAKE THE FIRST WEEK COUNT</span><h2>Give every new teammate<br />a place to start.</h2></div><Link className="button button-dark" href="/login">Explore your organization <ArrowRight size={16} /></Link></section>
      <footer className="marketing-footer"><Brand /><span>Organizational intelligence for teams in motion.</span><span>© 2026 OrgInGraphs</span></footer>
    </main>
  );
}
