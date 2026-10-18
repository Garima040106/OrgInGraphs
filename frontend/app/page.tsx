"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Network,
  UsersRound,
  Menu,
  X,
} from "lucide-react";

function LandingCursor() {
  const dotRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const root = document.querySelector(".landing");
    if (!root || !dotRef.current || !ringRef.current || !labelRef.current) return;
    root.classList.add("oig-cursor-enabled");

    let x = -100;
    let y = -100;
    let frame = 0;
    let queuedX = x;
    let queuedY = y;

    const render = () => {
      frame = 0;
      dotRef.current?.style.setProperty("transform", `translate3d(${queuedX}px, ${queuedY}px, 0)`);
      ringRef.current?.style.setProperty("transform", `translate3d(${queuedX}px, ${queuedY}px, 0)`);
    };

    const onPointerMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      queuedX = x;
      queuedY = y;
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const interactive = target?.closest("a, button, [role='button'], .landing-hero-visual, .architecture-visual");
      const graph = target?.closest(".landing-hero-visual");
      const architecture = target?.closest(".architecture-visual");
      root.classList.toggle("oig-cursor-hover", !!interactive);
      root.classList.toggle("oig-cursor-graph", !!graph);
      root.classList.toggle("oig-cursor-architecture", !!architecture);
      if (graph) labelRef.current!.textContent = "EXPLORE";
    };

    const onPointerLeave = () => root.classList.remove("oig-cursor-hover", "oig-cursor-graph", "oig-cursor-architecture");
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    document.documentElement.addEventListener("mouseleave", onPointerLeave);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerover", onPointerOver);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
      if (frame) window.cancelAnimationFrame(frame);
      root.classList.remove("oig-cursor-enabled", "oig-cursor-hover", "oig-cursor-graph", "oig-cursor-architecture");
    };
  }, []);

  return (
    <span className="oig-cursor-layer" aria-hidden="true">
      <span ref={ringRef} className="oig-cursor-ring" />
      <span ref={dotRef} className="oig-cursor-dot" />
      <span ref={labelRef} className="oig-cursor-label" />
    </span>
  );
}

/* ─── Graph preview illustration ──────────────────────────────────────────── */

function GraphPreview() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(28,40,70,0.09)]"
      aria-label="Illustration of a connected company graph"
    >
      {/* Toolbar */}
      <div className="flex h-[52px] items-center justify-between border-b border-slate-100 px-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <i className="h-[7px] w-[7px] rounded-full bg-[#f2b8a5]" />
            <i className="h-[7px] w-[7px] rounded-full bg-[#f0d38c]" />
            <i className="h-[7px] w-[7px] rounded-full bg-[#a6d9bd]" />
          </span>
          <span className="ml-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Organization graph
          </span>
        </div>
        <span className="rounded-md border border-slate-200 px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400">
          Illustration
        </span>
      </div>

      {/* Graph canvas */}
      <div className="relative h-[360px] overflow-hidden bg-[#fcfdff] sm:h-[420px]">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage: "radial-gradient(#d9e2f3 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 760 420"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <g stroke="#c9d7f0" strokeWidth="1.5" strokeDasharray="4 5">
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
          </g>
        </svg>

        {/* Central company */}
        <div className="absolute left-1/2 top-[47%] z-10 flex w-[190px] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_10px_25px_rgba(30,45,80,0.08)] sm:w-[208px]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
            <Image src="/img/HirenovaLogo.png" alt="" width={36} height={36} className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0">
            <b className="block text-[11px] font-bold text-slate-700">Hirenova</b>
            <small className="mt-1 block text-[10px] text-slate-400">Company</small>
          </span>
          <span className="ml-auto self-start text-xs text-slate-400">···</span>
        </div>

        {/* Person: Ava */}
        <div className="absolute left-[9%] top-[16%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eee8fc] text-[10px] font-bold text-[#8570c4]">AP</span>
          <span className="min-w-0">
            <b className="block text-[10px] text-slate-700">Ava Patel</b>
            <small className="mt-1 block text-[9px] text-slate-400">Engineering</small>
          </span>
        </div>

        {/* Person: Noah */}
        <div className="absolute right-[8%] top-[20%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e1f3eb] text-[10px] font-bold text-[#4e9a7a]">NC</span>
          <span className="min-w-0">
            <b className="block text-[10px] text-slate-700">Noah Chen</b>
            <small className="mt-1 block text-[9px] text-slate-400">Product</small>
          </span>
        </div>

        {/* Payments project */}
        <div className="absolute left-1/2 top-[5%] z-10 flex w-[165px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fbf0dc] text-[#c68c40]">
            <Network size={15} />
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">Payments API</b>
            <small className="mt-1 block text-[9px] text-slate-400">Project · active</small>
          </span>
        </div>

        {/* Person: Mia */}
        <div className="absolute bottom-[13%] left-[11%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fae9df] text-[10px] font-bold text-[#c77c60]">MR</span>
          <span>
            <b className="block text-[10px] text-slate-700">Mia Rivera</b>
            <small className="mt-1 block text-[9px] text-slate-400">Design</small>
          </span>
        </div>

        {/* Person: Jonah */}
        <div className="absolute bottom-[14%] right-[7%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e5edfc] text-[10px] font-bold text-[#6585c7]">JL</span>
          <span>
            <b className="block text-[10px] text-slate-700">Jonah Lee</b>
            <small className="mt-1 block text-[9px] text-slate-400">Infrastructure</small>
          </span>
        </div>

        {/* Department */}
        <div className="absolute bottom-[4%] left-1/2 z-10 flex w-[165px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eeebfc] text-[#8170d0]">
            <UsersRound size={15} />
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">Software Eng.</b>
            <small className="mt-1 block text-[9px] text-slate-400">Department</small>
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[9px] text-slate-400 sm:px-5">
        <span>People, projects, decisions — connected.</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#7185ee]" />People</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#9b85df]" />Teams</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#e2ad67]" />Projects</span>
        </span>
      </div>
    </div>
  );
}

/* ─── Mobile navigation menu ───────────────────────────────────────────────── */

function MobileMenu() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#company-graph", label: "Company graph" },
    { href: "#integrations", label: "Integrations" },
  ];

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7E4D9] bg-[#FFFEF3] text-[#3F403D] transition hover:bg-[#E8F4EC] hover:text-[#174D35]"
      >
        {open ? <X size={17} /> : <Menu size={17} />}
      </button>

      {open && (
        <nav
          className="lp-mobile-menu absolute inset-x-3 top-[72px] z-40 flex flex-col gap-1 rounded-2xl border border-[#E7E4D9] bg-[#FFFEF3] p-3 shadow-[0_18px_50px_rgba(25,25,27,.12)]"
          aria-label="Mobile navigation"
        >
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-[#3F403D] transition hover:bg-[#E8F4EC] hover:text-[#174D35]"
            >
              {label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-[#E7E4D9] pt-3">
            {/* <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-[#3F403D] transition hover:text-[#174D35]"
            >
              Sign in
            </Link> */}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#19191B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#174D35]"
            >
              Get started free <ArrowRight size={15} />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const [activeUspChapter, setActiveUspChapter] = useState(1);

  return (
    <main className="landing min-h-screen bg-[#FFFEF3] text-[#19191B]">
      <LandingCursor />

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <header
        className="landing-nav relative z-50 mx-auto flex min-h-[54px] w-[calc(100%-24px)] max-w-[1240px] items-center justify-between gap-4 rounded-full px-4 sm:min-h-[56px] sm:w-[calc(100%-40px)] sm:px-7"
        role="banner"
      >
        {/* Logo */}
        <Link href="/" aria-label="OrgInGraphs home" className="landing-brand flex shrink-0 items-center">
          <Image
            src="/img/logo.png"
            alt="OrgInGraphs"
            width={48}
            height={48}
            priority
            className="h-10 w-12 object-contain object-left sm:h-12 sm:w-[54px]"
          />
          <span className="landing-brand-wordmark" aria-hidden="true">
            Org<span>In</span>Graphs
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="ml-auto hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          <a href="#features"       className="lp-nav-link">Features</a>
          <a href="#how-it-works"   className="lp-nav-link">How it works</a>
          <a href="#company-graph"  className="lp-nav-link">Company graph</a>
          <a href="#integrations"   className="lp-nav-link">Integrations</a>
        </nav>

        {/* Desktop actions */}
        <div className="ml-8 hidden shrink-0 items-center gap-4 lg:flex">
          {/* <Link href="/login" className="lp-nav-link">Sign in</Link> */}
          <Link
            href="/login"
            id="nav-get-started"
            className="lp-nav-cta inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-[#19191B] px-4 text-xs font-semibold text-white transition-all hover:bg-[#174D35] hover:-translate-y-px sm:min-h-10 sm:px-5 sm:text-sm"
          >
            Get started free <ArrowRight size={14} />
          </Link>
        </div>

        {/* Mobile burger */}
        <MobileMenu />
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="landing-hero-shell landing-hero-frame">
        <section
          className="landing-hero mx-auto grid w-[calc(100%-40px)] max-w-[1240px] grid-cols-1 gap-12 sm:w-[calc(100%-40px)] lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:gap-12"
          aria-labelledby="hero-headline"
        >
          {/* Copy */}
          <div className="landing-hero-copy lp-enter-1">
            <div className="landing-kicker mb-7 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em]">
              <span />
              ORGANIZATIONAL INTELLIGENCE · COMPANY GRAPH
            </div>

            <h1 id="hero-headline">
              Understand your<br />
              organization.<br />
              <em>Connect every insight.</em>
            </h1>

            <p>
              Turn your organization's people, departments, projects, and
              relationships into an intelligent knowledge graph. Explore how
              your company works, discover connections, and make
              better-informed decisions.
            </p>

            <div className="landing-hero-actions mt-8 flex flex-wrap items-center gap-3 sm:gap-5">
              <Link
                href="/login"
                id="hero-get-started"
                className="landing-hero-cta inline-flex min-h-[52px] items-center gap-3 rounded-full px-5 text-sm font-semibold transition-all hover:-translate-y-0.5"
              >
                Get started free
                <ArrowRight size={17} />
              </Link>

              <a
                href="#features"
                id="hero-explore-platform"
                className="landing-hero-link inline-flex min-h-[48px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
              >
                Explore the platform
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="landing-hero-proof">
              <span><i /><i /><i /></span>
              People, projects, and knowledge — connected.
            </div>
          </div>

          {/* Visual */}
          <div className="landing-hero-visual lp-enter-2">
            <div className="landing-preview-heading">
              <span>
                <small>ORGINOGRAPHS / CONCEPT VIEW</small>
                <b>Company graph</b>
              </span>
              <span className="landing-preview-status"><i /> Illustration</span>
            </div>
            <GraphPreview />
            <div className="landing-preview-footer">
              <span>People, teams, projects, and decisions</span>
              <span>Explore the graph <ArrowUpRight size={12} /></span>
            </div>
          </div>
        </section>
      </div>

      {/* ── How it works (3 steps) ─────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="lp-section mx-auto w-[calc(100%-40px)] max-w-[1240px] border-t border-[#e9e8dc] py-16 sm:py-20"
        aria-labelledby="how-heading"
      >
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lp-reveal">
            <div className="how-eyebrow">
              HOW IT WORKS
            </div>
            <h2 id="how-heading" className="how-heading">
              From scattered context to a clearer view.
            </h2>
            <p className="how-copy">
              Bring organizational information together, shape the context, and explore how the pieces connect.
            </p>
            <Link
              href="/login"
              id="how-create-workspace"
              className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#19191b] px-6 text-sm font-semibold !text-white transition-all hover:-translate-y-0.5 hover:bg-[#174d35]"
            >
              Explore the workspace
              <ArrowRight size={16} />
            </Link>
            <p className="mt-3 text-xs text-[#85877c]">
              Already have a workspace?{" "}
              <Link href="/login" className="font-semibold text-[#174d35] underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                number: "01",
                title: "Connect your sources",
                description: "Bring organizational information in from supported data sources.",
              },
              {
                number: "02",
                title: "Organize the context",
                description: "Normalize and process source documents into structured organizational information.",
              },
              {
                number: "03",
                title: "Explore your company graph",
                description: "Explore connected people, teams, projects, and other organizational entities.",
              },
            ].map((step, i) => (
              <article
                key={step.number}
                className="lp-step-card group rounded-2xl border border-[#e8e7dc] bg-white/70 p-5 transition-all hover:border-[#b7c7b5] hover:bg-white sm:p-6"
                style={{ "--step-i": i } as React.CSSProperties}
              >
                <div className="flex gap-4 sm:gap-5">
                  <div className="how-number">
                    {step.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="how-step-title">{step.title}</h3>
                    <p className="how-step-description">{step.description}</p>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="mt-1 shrink-0 text-[#9ba392] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature / Company graph section ───────────────────────────── */}
      <section
        className="lp-section mx-auto w-[calc(100%-40px)] max-w-[1424px] border-t border-slate-100 py-20 sm:w-[calc(100%-64px)] sm:py-28"
        aria-labelledby="features-heading"
      >
        <div className="usp-eyebrow">
          WHY ORGINOGRAPHS
        </div>

        <div id="features" className="usp-intro">
          <h2 id="features-heading" className="usp-heading">
            Your organization is connected.<br />
            <em>Your tools just don't show it.</em>
          </h2>
          <div className="usp-intro-copy">
            <p>
              Bring organizational context into one connected view, so relationships and dependencies are easier to understand.
            </p>
          </div>
        </div>

        <div className="usp-composition">
          <div id="company-graph" className={`usp-graph-panel usp-graph-state-${activeUspChapter}`}>
            <div className="usp-graph-panel-heading">
              <span className="usp-index">ORGANIZATIONAL GRAPH</span>
              <span className="usp-graph-status"><i /> Illustrative view</span>
            </div>
            <Image
              className="usp-feature-image"
              src="/img/Graph.png"
              alt="OrgInGraphs company graph showing Hirenova connected to its departments"
              width={878}
              height={869}
              priority={false}
            />
            <p className="usp-graph-caption">Explore how your company connects to teams, departments, projects, and services.</p>
          </div>

          <div className="usp-chapters" aria-label="OrgInGraphs capabilities">
            <button type="button" className={`usp-chapter ${activeUspChapter === 1 ? "usp-chapter-active" : ""}`} aria-pressed={activeUspChapter === 1} onClick={() => setActiveUspChapter(1)}>
              <span className="usp-chapter-number">01</span>
              <div><h3>One connected company brain</h3><p>Connect people, teams, departments, projects, services, and decisions in a knowledge graph.</p></div>
            </button>
            <button type="button" className={`usp-chapter ${activeUspChapter === 2 ? "usp-chapter-active" : ""}`} aria-pressed={activeUspChapter === 2} onClick={() => setActiveUspChapter(2)}>
              <span className="usp-chapter-number">02</span>
              <div><h3>Context across disconnected tools</h3><p>Bring information from supported organizational sources into a more connected view.</p></div>
            </button>
            <button type="button" className={`usp-chapter ${activeUspChapter === 3 ? "usp-chapter-active" : ""}`} aria-pressed={activeUspChapter === 3} onClick={() => setActiveUspChapter(3)}>
              <span className="usp-chapter-number">03</span>
              <div><h3>Trace relationships, not just records</h3><p>Explore how organizational entities relate to one another instead of viewing isolated records.</p></div>
            </button>
            <button type="button" className={`usp-chapter ${activeUspChapter === 4 ? "usp-chapter-active" : ""}`} aria-pressed={activeUspChapter === 4} onClick={() => setActiveUspChapter(4)}>
              <span className="usp-chapter-number">04</span>
              <div><h3>Discover organizational knowledge</h3><p>Make existing connections and organizational context easier to explore.</p></div>
            </button>
          </div>
        </div>

        {/* Post-feature CTA */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            id="features-get-started"
            className="inline-flex min-h-[48px] items-center gap-3 rounded-full bg-[#19191B] px-6 text-sm font-semibold !text-white transition-all hover:-translate-y-0.5 hover:bg-[#174D35]"
          >
            Get started free <ArrowRight size={16} />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#D9D7CE] px-6 text-sm font-medium text-[#3F403D] transition hover:border-[#174D35] hover:text-[#174D35]"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* ── Architecture ──────────────────────────────────────────────── */}
      <section className="architecture-section" aria-labelledby="architecture-heading">
        <div className="architecture-copy">
          <div className="architecture-eyebrow">THE ORGINOGRAPHS ARCHITECTURE</div>
          <h2 id="architecture-heading">From organizational signals to connected context.</h2>
          <p>Source information is processed into searchable context and structured graph relationships. The diagram shows the current product architecture at a conceptual level.</p>
        </div>

        <div className="architecture-visual" aria-label="Illustrative OrgInGraphs architecture flow">
          <div className="architecture-flow-label architecture-flow-label-sources">SOURCE INFORMATION</div>
          <ol className="architecture-source-list" aria-label="Source systems"><li>Jira</li><li>Confluence</li><li>GitHub</li><li>Slack</li></ol>
          <p className="architecture-sr-only">Jira, Confluence, GitHub, and Slack feed Workspace identity ingestion, then the embedding service, then persistent vector storage, and finally the FalkorDB organizational knowledge graph. Amazon Titan Text Embeddings V2 is an alternative 1,024-dimensional configuration.</p>

          <svg className="architecture-flow-svg" viewBox="0 0 100 438" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <path className="architecture-path architecture-path-source" d="M12 82 C14 82 14 118 16 194" fill="none" stroke="#9db9a3" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
            <path className="architecture-path architecture-path-source" d="M12 123 C14 123 14 143 16 194" fill="none" stroke="#9db9a3" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
            <path className="architecture-path architecture-path-source" d="M12 164 C14 164 14 166 16 194" fill="none" stroke="#9db9a3" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
            <path className="architecture-path architecture-path-source" d="M12 205 C14 205 14 194 16 194" fill="none" stroke="#9db9a3" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
          </svg>

          <ol className="architecture-stages" aria-label="Architecture stages">
          <li className="architecture-node architecture-node-ingest">
            <span className="architecture-node-kicker">01 · INGEST</span>
            <strong>Workspace identity</strong>
            <small>Source ingestion and processing</small>
          </li>
          <li className="architecture-node architecture-node-embed">
            <span className="architecture-node-kicker">02 · EMBED</span>
            <strong>Embedding service</strong>
            <span className="architecture-dimension"><b>3,072</b><small>dimensions · Default path</small></span>
          </li>
          <li className="architecture-node architecture-node-vector">
            <span className="architecture-node-kicker">03 · RETRIEVE</span>
            <strong>Vector store</strong>
            <small>Persistent document vectors</small>
          </li>
          <li className="architecture-node architecture-node-graph">
            <span className="architecture-node-kicker">04 · CONNECT</span>
            <strong>FalkorDB</strong>
            <small>Organizational knowledge graph</small>
            <svg className="architecture-graph-network" viewBox="0 0 220 112" aria-hidden="true"><g><path d="M20 54 L61 25 L103 54 L145 22 L193 52 M61 25 L76 91 L103 54 L163 89 L193 52 M20 54 L76 91 M145 22 L163 89" /></g><circle cx="20" cy="54" r="7" /><rect x="54" y="18" width="14" height="14" rx="4" /><path d="M103 45 L112 54 L103 63 L94 54 Z" /><polygon points="145,13 154,18 154,28 145,33 136,28 136,18" /><circle cx="193" cy="52" r="9" /><circle cx="76" cy="91" r="6" /><rect x="156" y="82" width="14" height="14" rx="4" /></svg>
            <div className="architecture-graph-legend" aria-label="Graph entity types"><span>People</span><span>Teams</span><span>Projects</span><span>Services</span><span>Decisions</span></div>
          </li>
          </ol>
          <div className="architecture-note architecture-note-titan">
            <span>ALTERNATIVE CONFIGURATION</span>
            <strong>Amazon Titan Text Embeddings V2</strong>
            <b>1,024 dimensions</b>
          </div>
          <p className="architecture-caption">Illustrative architecture visualization — not a live operational dashboard.</p>
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section
        className="landing-closing mx-auto mb-8 flex w-[calc(100%-40px)] max-w-[1424px] flex-col items-start justify-between gap-8 rounded-3xl px-7 py-12 sm:w-[calc(100%-64px)] sm:px-12 sm:py-16 lg:flex-row lg:items-center"
        aria-labelledby="closing-heading"
      >
        <div>
          <div className="closing-eyebrow">
            YOUR ORGANIZATION, IN CONTEXT
          </div>
          <h2 id="closing-heading" className="closing-heading">
            See the bigger picture.
          </h2>
          <p className="closing-copy">Explore the people, projects, and relationships that make your organization work.</p>
        </div>

        <Link
          href="/login"
          id="closing-cta"
          className="inline-flex min-h-[52px] items-center gap-3 rounded-xl bg-[#202a43] px-5 text-sm font-bold !text-white transition-all hover:-translate-y-0.5 hover:bg-[#34466d]"
        >
          Explore the company graph <ArrowRight size={16} />
        </Link>
      </section>

      {/* ── Integrations marquee ───────────────────────────────────────── */}
      <section id="integrations" className="integration-marquee" aria-label="Connected platforms">
        <span className="integration-marquee-label">CONNECTED TO YOUR WORK</span>
        <div className="integration-marquee-window">
          <div className="integration-marquee-track">
            {[0, 1].map((copy) => (
              <div className="integration-marquee-group" key={copy} aria-hidden={copy === 1}>
                <span>Confluence</span><i>✳</i>
                <span>Jira</span><i>✳</i>
                <span>Slack</span><i>✳</i>
                <span>GitHub</span><i>✳</i>
                <span>FalkorDB</span><i>✳</i>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="landing-footer" role="contentinfo">
        <div>
          <Link
            href="/"
            aria-label="OrgInGraphs home"
            className="block font-serif text-5xl leading-none tracking-[-0.065em] text-[#20202a] sm:text-6xl lg:text-7xl"
          >
            OrgInGraphs
          </Link>
          <p className="mt-3 text-sm text-[#7d7c78]">Find the people and context behind the work.</p>
        </div>

        <div className="landing-footer-links">
          <div>
            <small>PRODUCT</small>
            <Link href="/">Home</Link>
            <a href="#how-it-works">How it works</a>
            <Link href="/login">Workspace</Link>
          </div>
          <div>
            <small>EXPLORE</small>
            <a href="#company-graph">Company graph</a>
            <Link href="/login">People and teams</Link>
            <Link href="/login">Projects</Link>
          </div>
          <div>
            <small>SOURCES</small>
            <a href="#integrations">Source systems</a>
            <a href="#company-graph">Company graph</a>
            <a href="#how-it-works">How it works</a>
          </div>
          <div>
            <small>ABOUT OIG</small>
            <span>Company knowledge, connected.</span>
            <span>Built for teams in motion.</span>
            <span>© 2026 OrgInGraphs</span>
          </div>
        </div>

        <div className="mt-8 border-t border-[#e8e4d8] pt-7 sm:mt-10 sm:pt-8">
          <p className="text-sm leading-6 text-[#7d7c78] sm:text-right">
            A clearer view of your organization, its knowledge, and how work connects.
          </p>
        </div>
      </footer>
    </main>
  );
}
