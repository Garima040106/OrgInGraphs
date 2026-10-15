"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleHelp, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/Brand";

const demoEmail = "demo@hirenova.example";

export default function LoginPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");

  function enterDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = workspace.trim() || demoEmail;
    if (!value.includes("@")) {
      setError("Enter a valid work email to continue.");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("oig-demo-workspace", value);
    }
    router.push("/dashboard");
  }

  return (
    <main className="login-page">
      <div className="login-top"><Brand href="/" /><a className="back-link" href="/"><ArrowLeft size={14} /> Back to OIG</a></div>
      <div className="login-layout">
        <section className="login-story">
          <div className="eyebrow"><span className="eyebrow-dot" /> Your company, connected</div>
          <h1>Start with the<br /><span>full picture.</span></h1>
          <p>Explore how your people, projects, and knowledge connect — all in one place.</p>
          <div className="login-story-note"><div className="mini-graph"><i /><i /><i /><i /><b /><b /></div><span>One living graph.<br /><strong>A better first week.</strong></span></div>
        </section>
        <section className="login-card">
          <span className="login-card-kicker">COMPANY ACCESS</span>
          <h2>Welcome to OIG</h2>
          <p className="muted-copy">Enter your work email to open the demo workspace.</p>
          <form onSubmit={enterDemo} noValidate>
            <label htmlFor="workspace-email">Work email</label>
            <input id="workspace-email" type="email" autoComplete="email" placeholder="you@company.com" value={workspace} onChange={(event) => { setWorkspace(event.target.value); setError(""); }} aria-describedby={error ? "login-error" : undefined} />
            {error && <p className="form-error" id="login-error">{error}</p>}
            <button className="button button-primary login-submit" type="submit">Continue to demo <ArrowRight size={15} /></button>
          </form>
          <div className="login-divider"><span>DEMO WORKSPACE</span></div>
          <div className="demo-notice"><LockKeyhole size={16} /><p><strong>Demo access only</strong><br />Authentication isn’t configured yet. Your email is stored only in this browser and does not create an account.</p></div>
          <p className="login-help"><CircleHelp size={14} /> Need help? Contact your workspace administrator.</p>
        </section>
      </div>
      <footer className="login-footer"><span>© 2026 OrgInGraphs</span><span>Organizational intelligence, made clear.</span></footer>
    </main>
  );
}
