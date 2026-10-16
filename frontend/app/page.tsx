
import Link from "next/link";
import Image from "next/image";
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
            backgroundImage:
              "radial-gradient(#d9e2f3 1px, transparent 1px)",
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
          <g
            stroke="#c9d7f0"
            strokeWidth="1.5"
            strokeDasharray="4 5"
          >
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#263653] text-sm font-bold text-white">
            H
          </span>
          <span className="min-w-0">
            <b className="block text-[11px] font-bold text-slate-700">
              Hirenova
            </b>
            <small className="mt-1 block text-[10px] text-slate-400">
              Company
            </small>
          </span>
          <span className="ml-auto self-start text-xs text-slate-400">
            ···
          </span>
        </div>

        {/* Person: Ava */}
        <div className="absolute left-[9%] top-[16%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)] sm:left-[9%] sm:w-[165px]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eee8fc] text-[10px] font-bold text-[#8570c4]">
            AP
          </span>
          <span className="min-w-0">
            <b className="block text-[10px] text-slate-700">Ava Patel</b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Engineering
            </small>
          </span>
        </div>

        {/* Person: Noah */}
        <div className="absolute right-[8%] top-[20%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e1f3eb] text-[10px] font-bold text-[#4e9a7a]">
            NC
          </span>
          <span className="min-w-0">
            <b className="block text-[10px] text-slate-700">Noah Chen</b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Product
            </small>
          </span>
        </div>

        {/* Payments project */}
        <div className="absolute left-1/2 top-[5%] z-10 flex w-[165px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fbf0dc] text-[#c68c40]">
            <Network size={15} />
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">
              Payments API
            </b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Project · active
            </small>
          </span>
        </div>

        {/* Person: Mia */}
        <div className="absolute bottom-[13%] left-[11%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fae9df] text-[10px] font-bold text-[#c77c60]">
            MR
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">Mia Rivera</b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Design
            </small>
          </span>
        </div>

        {/* Person: Jonah */}
        <div className="absolute bottom-[14%] right-[7%] z-10 flex w-[165px] items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e5edfc] text-[10px] font-bold text-[#6585c7]">
            JL
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">Jonah Lee</b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Infrastructure
            </small>
          </span>
        </div>

        {/* Department */}
        <div className="absolute bottom-[4%] left-1/2 z-10 flex w-[165px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(30,45,80,0.06)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eeebfc] text-[#8170d0]">
            <UsersRound size={15} />
          </span>
          <span>
            <b className="block text-[10px] text-slate-700">
              Software Eng.
            </b>
            <small className="mt-1 block text-[9px] text-slate-400">
              Department
            </small>
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[9px] text-slate-400 sm:px-5">
        <span>People, projects, decisions — connected.</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#7185ee]" />
            People
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#9b85df]" />
            Teams
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#e2ad67]" />
            Projects
          </span>
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing min-h-screen bg-[#FFFEF3] text-[#19191B]">
      <header className="landing-nav z-50 mx-auto flex min-h-[54px] w-[calc(100%-24px)] max-w-[1240px] items-center justify-between gap-4 rounded-full px-4 sm:min-h-[56px] sm:w-[calc(100%-40px)] sm:px-7">
        {/* Logo */}
        <Link
          href="/"
          aria-label="OrgInGraphs home"
          className="flex shrink-0 items-center"
        >
          <Image
            src="/img/logo.png"
            alt="OrgInGraphs"
            width={150}
            height={48}
            priority
            className="h-10 w-[105px] object-contain object-left sm:h-12 sm:w-[150px]"
          />
        </Link>

        {/* Desktop navigation */}
        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          <a
            href="#product"
            className="text-xs font-medium text-[#5F605B] transition-colors hover:text-[#174D35]"
          >
            Product
          </a>
          <a
            href="#getting-started"
            className="text-xs font-medium text-[#5F605B] transition-colors hover:text-[#174D35]"
          >
            Getting started
          </a>
          <a
            href="#why-oig"
            className="text-xs font-medium text-[#5F605B] transition-colors hover:text-[#174D35]"
          >
            Company graph
          </a>
          <a href="#integrations" className="text-xs font-medium text-[#5F605B] transition-colors hover:text-[#174D35]">Integrations</a>
        </nav>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-3 sm:gap-5 lg:ml-8">
          <Link
            href="/login"
            className="text-xs font-medium text-[#5F605B] transition-colors hover:text-[#174D35] sm:text-sm"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-[#19191B] px-4 text-xs font-semibold text-white transition-all hover:bg-[#174D35] sm:min-h-10 sm:px-5 sm:text-sm"
          >
            <span className="hidden text-white min-[380px]:inline">
              Get started
            </span>
            <span className="min-[380px]:hidden">Open</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <div className="landing-hero-shell landing-hero-frame">
      <section className="landing-hero mx-auto grid w-[calc(100%-40px)] max-w-[1240px] grid-cols-1 gap-12 sm:w-[calc(100%-40px)] lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:gap-12">
        <div className="landing-hero-copy">
          <div className="landing-kicker mb-7 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em]">
            <span />
            ORGANIZATIONAL INTELLIGENCE · COMPANY GRAPH
          </div>

          <h1>
            Your company
            <br />
            has a story.
            <br />
            <em>See what connects.</em>
          </h1>

          <p>
            Bring people, projects, and decisions into one evolving picture—then make the relationships behind your work easier to see.
          </p>

          <div className="landing-hero-actions mt-8 flex flex-wrap items-center gap-3 sm:gap-5">
            <Link
              href="/login"
              className="landing-hero-cta inline-flex min-h-[52px] items-center gap-3 rounded-full px-5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            >
              Get started
              <ArrowRight size={17} />
            </Link>

            <a
              href="#getting-started"
              className="landing-hero-link inline-flex min-h-[48px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
            >
              See how it works
              <ArrowDownRight size={16} />
            </a>
          </div>
          <div className="landing-hero-proof"><span><i /><i /><i /></span> People, projects, and knowledge—connected.</div>
        </div>

        <div className="landing-hero-visual">
          <div className="landing-preview-heading"><span><small>ORGINOGRAPHS / LIVE VIEW</small><b>Company graph</b></span><span className="landing-preview-status"><i /> Connected</span></div>
          <GraphPreview />
          <div className="landing-preview-footer"><span>People, teams, projects, and decisions</span><span>Explore the graph <ArrowUpRight size={12} /></span></div>
        </div>
      </section>
      </div>


      {/* Getting started */}
      <section
        id="getting-started"
        className="mx-auto w-[calc(100%-40px)] max-w-[1240px] border-t border-[#e9e8dc] py-16 sm:py-20"
      >
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#71816c]">
              GET STARTED · 3 SIMPLE STEPS
            </div>
            <h2 className="mt-5 max-w-md font-serif text-4xl leading-tight tracking-[-0.04em] text-[#1d2942] sm:text-5xl">
              Your organization, connected.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#78816f]">
              Start with your workspace, bring your company context together,
              and discover how your people and projects connect.
            </p>
           <Link
  href="/login"
  className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#19191b] px-6 text-sm font-semibold !text-white transition-all hover:-translate-y-0.5 hover:bg-[#174d35]"
>
  Set up your workspace
  <ArrowRight size={16} />
</Link>
            <p className="mt-3 text-xs text-[#85877c]">
              Already have a workspace?{" "}
              <Link
                href="/login"
                className="font-semibold text-[#174d35] underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                number: "01",
                title: "Create your workspace",
                description:
                  "Start with your organization name and establish a home for your company knowledge.",
                tag: "YOUR FOUNDATION",
              },
              {
                number: "02",
                title: "Bring your company context together",
                description:
                  "Add people, departments, and projects. Connect supported tools as integrations become available.",
                tag: "YOUR CONTEXT",
              },
              {
                number: "03",
                title: "Explore your organization graph",
                description:
                  "Discover relationships between teammates, teams, and projects to find the context behind the work.",
                tag: "YOUR INSIGHTS",
              },
            ].map((step) => (
              <article
                key={step.number}
                className="group rounded-2xl border border-[#e8e7dc] bg-white/70 p-5 transition-all hover:border-[#b7c7b5] hover:bg-white sm:p-6"
              >
                <div className="flex gap-4 sm:gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf2e8] text-sm font-bold text-[#315a3e]">
                    {step.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold tracking-[0.15em] text-[#89917f]">
                      {step.tag}
                    </div>
                    <h3 className="mt-2 text-base font-bold tracking-tight text-[#25314b]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#78816f]">
                      {step.description}
                    </p>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="mt-1 shrink-0 text-[#9ba392] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why OIG */}
      <section
        id="why-oig"
        className="mx-auto w-[calc(100%-40px)] max-w-[1424px] border-t border-slate-100 py-20 sm:w-[calc(100%-64px)] sm:py-28"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7b8bb0]">
          The context gap
        </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-16">
          <h2 className="font-serif text-4xl leading-[1.12] tracking-[-0.04em] text-[#1d2942] sm:text-5xl lg:text-6xl">
            Great work shouldn’t depend on
            <br className="hidden sm:block" /> knowing who to ask.
          </h2>

          <div className="max-w-lg">
            <p className="text-base leading-8 text-[#78869e]">
              Company knowledge is everywhere. OIG brings it together, so
              people can find the people, projects, and decisions behind the
              work.
            </p>
            <a
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#5267df] transition-colors hover:text-indigo-800"
              href="#product"
            >
              Meet your company graph
              <ArrowRight size={15} />
            </a>
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Feature 1 */}
          <article
            id="product"
            className="group relative flex min-h-[355px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(28,40,70,0.07)] sm:p-8"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf1ff] text-[#596fe4]">
              <Compass size={20} />
            </div>
            <div className="mt-7 text-[10px] font-bold tracking-[0.16em] text-[#8997b1]">
              01 / EXPLORE
            </div>
            <h3 className="mt-3 text-xl font-bold tracking-tight text-[#25314b]">
              See how the pieces connect.
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#7b899f]">
              Move through a living map of people, teams, and projects. Follow
              the relationships that explain how work actually happens.
            </p>

            <div className="relative mt-auto h-[95px] overflow-hidden pt-5">
              <svg
                viewBox="0 0 260 90"
                className="h-full w-full"
                fill="none"
                aria-hidden="true"
              >
                <g stroke="#cbd6f3" strokeWidth="1.5">
                  <path d="M35 58 L95 25 L147 56 L210 20 L235 65" />
                  <path d="M95 25 L105 75 L147 56 L210 80" />
                </g>
                <g fill="#fff" stroke="#8496e8" strokeWidth="2">
                  <circle cx="35" cy="58" r="7" />
                  <circle cx="95" cy="25" r="8" />
                  <circle cx="147" cy="56" r="10" />
                  <circle cx="210" cy="20" r="7" />
                  <circle cx="235" cy="65" r="6" />
                  <circle cx="105" cy="75" r="6" />
                  <circle cx="210" cy="80" r="6" />
                </g>
              </svg>
            </div>
          </article>

          {/* Feature 2 */}
          <article className="group relative flex min-h-[355px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(28,40,70,0.07)] sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0ebff] text-[#8a70d7]">
              <Search size={20} />
            </div>
            <div className="mt-7 text-[10px] font-bold tracking-[0.16em] text-[#8997b1]">
              02 / DISCOVER
            </div>
            <h3 className="mt-3 text-xl font-bold tracking-tight text-[#25314b]">
              Find the right person, faster.
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#7b899f]">
              Search beyond titles. Find teammates by what they work on, what
              they know, and where they’re connected.
            </p>

            <div className="mt-auto space-y-3 pt-6">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-[#fbfcff] px-3 py-2.5 text-xs text-slate-400">
                <Search size={14} />
                idempotency
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eee8fc] text-[10px] font-bold text-[#8570c4]">
                  AP
                </span>
                <span>
                  <b className="block text-xs text-slate-700">Ava Patel</b>
                  <small className="mt-1 block text-[10px] text-slate-400">
                    Payments · Software Engineering
                  </small>
                </span>
              </div>
            </div>
          </article>

          {/* Feature 3 */}
          <article className="group relative flex min-h-[355px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(28,40,70,0.07)] sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff4e5] text-[#c78e45]">
              <Sparkles size={20} />
            </div>
            <div className="mt-7 text-[10px] font-bold tracking-[0.16em] text-[#8997b1]">
              03 / UNDERSTAND
            </div>
            <h3 className="mt-3 text-xl font-bold tracking-tight text-[#25314b]">
              Get the context behind the work.
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#7b899f]">
              Open any profile or project to see the connections around it and
              build a fuller picture, one step at a time.
            </p>

            <div className="mt-auto flex items-center gap-3 rounded-xl border border-slate-100 bg-[#fcfdff] p-3 shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eee8fc] text-[10px] font-bold text-[#8570c4]">
                AP
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs text-slate-700">
                  Ledger reconciliation
                </b>
                <small className="mt-1 block text-[10px] text-slate-400">
                  Owned by Ava · 3 connections
                </small>
              </span>
              <ArrowUpRight size={15} className="text-slate-400" />
            </div>
          </article>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="landing-closing mx-auto mb-8 flex w-[calc(100%-40px)] max-w-[1424px] flex-col items-start justify-between gap-8 rounded-3xl px-7 py-12 sm:w-[calc(100%-64px)] sm:px-12 sm:py-16 lg:flex-row lg:items-center">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7b8bb0]">
            START WITH YOUR ORGANIZATION
          </div>
          <h2 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.04em] text-[#1d2942] sm:text-5xl">
            Give your team the context
            <br /> to do its best work.
          </h2>
        </div>

        <Link
  href="/login"
  className="inline-flex min-h-[52px] items-center gap-3 rounded-xl bg-[#202a43] px-5 text-sm font-bold !text-white transition-all hover:-translate-y-0.5 hover:bg-[#34466d]"
>
  Build your company graph
  <ArrowRight size={16} />
</Link>
      </section>

      <section className="integration-marquee" id="integrations" aria-label="Connected platforms">
        <span className="integration-marquee-label">CONNECTED TO YOUR WORK</span>
        <div className="integration-marquee-window">
          <div className="integration-marquee-track">
            {[0, 1].map((copy) => (
              <div className="integration-marquee-group" key={copy} aria-hidden={copy === 1}>
                <span>Confluence</span><i>✳</i><span>Jira</span><i>✳</i><span>Slack</span><i>✳</i><span>GitHub</span><i>✳</i><span>FalkorDB</span><i>✳</i>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
              <Link
                href="/"
                aria-label="OrgInGraphs home"
                className="block font-serif text-5xl leading-none tracking-[-0.065em] text-[#20202a] sm:text-6xl lg:text-7xl"
              >
                OrgInGraphs
              </Link>
              <p className="mt-3 text-sm text-[#7d7c78]">
                Find the people and context behind the work.
              </p>
            </div>
        <div className="landing-footer-links">
          <div><small>PRODUCT</small><Link href="/">Home</Link><a href="#product">How it works</a><Link href="/login">Workspace</Link></div>
          <div><small>EXPLORE</small><a href="#why-oig">Company graph</a><Link href="/login">People and teams</Link><Link href="/login">Projects</Link></div>
          <div><small>CONNECTED</small><a href="#integrations">Confluence · Jira</a><a href="#integrations">Slack · GitHub</a><a href="#integrations">FalkorDB graph</a></div>
          <div><small>ABOUT OIG</small><span>Company knowledge, connected.</span><span>Built for teams in motion.</span><span>© 2026 OrgInGraphs</span></div>
        </div>
        <div className="mt-8 border-t border-[#e8e4d8] pt-7 sm:mt-10 sm:pt-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            
            <p className="max-w-xl text-sm leading-6 text-[#7d7c78] sm:text-right">
              A clearer view of your organization, its knowledge, and how work connects.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
