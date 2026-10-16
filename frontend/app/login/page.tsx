 
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/Brand";

const demoEmail = "demo@hirenova.example";

export default function LoginPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");

  function enterDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = workspace.trim() || demoEmail;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid work email address.");
      return;
    }

    window.localStorage.setItem("oig-demo-workspace", value);
    router.push("/dashboard");
  }

  return (
    <main className="login-page min-h-screen bg-[#FFFEF3] px-5 text-[#19191b]">
      {/* Top navigation */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between py-7">
        <Brand href="/" />

        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#62625d] transition-colors hover:text-[#174d35]"
        >
          <ArrowLeft size={15} />
          Back to home
        </a>
      </header>

      {/* Centered login experience */}
      <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-md flex-col justify-center pb-12">
        <section className="rounded-2xl border border-[#e8e6d9] bg-white p-7 shadow-[0_12px_45px_rgba(25,25,27,0.045)] sm:p-10">
          {/* Brand and heading */}
          <div className="mb-8">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf2e8] text-[#174d35]">
              <LockKeyhole size={21} strokeWidth={1.8} />
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#73736b]">
              OrgInGraphs workspace
            </p>

            <h1 className="text-3xl font-semibold tracking-tight">
              Sign in to continue
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#66665f]">
              Enter your work email to access your organization’s connected
              knowledge and workspace.
            </p>
          </div>

          {/* Email form */}
          <form onSubmit={enterDemo} noValidate>
            <label
              htmlFor="workspace-email"
              className="mb-2 block text-sm font-semibold"
            >
              Work email
            </label>

            <input
              id="workspace-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="name@company.com"
              value={workspace}
              onChange={(event) => {
                setWorkspace(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              className={`h-12 w-full rounded-lg border bg-white px-3.5 text-sm text-[#19191b] outline-none transition placeholder:text-[#99998f] focus:border-[#347653] focus:ring-4 focus:ring-[#347653]/10 ${
                error ? "border-red-500" : "border-[#d9d9cf]"
              }`}
            />

            {error && (
              <p id="login-error" role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#19191b] px-5 text-sm font-semibold !text-white transition hover:-translate-y-0.5 hover:bg-[#174d35] focus:outline-none focus:ring-4 focus:ring-[#347653]/20"
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Demo notice */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e9e8df]" />
            <span className="text-[10px] font-semibold tracking-[0.14em] text-[#85857b]">
              DEMO ACCESS
            </span>
            <div className="h-px flex-1 bg-[#e9e8df]" />
          </div>

          <div className="rounded-lg border border-[#e8e6d9] bg-[#fbfaf4] p-3.5">
            <div className="flex gap-3">
              <LockKeyhole
                size={17}
                className="mt-0.5 shrink-0 text-[#5c725e]"
              />
              <div>
                <p className="text-sm font-semibold">Explore the demo workspace</p>
                <p className="mt-1 text-xs leading-5 text-[#6d6d64]">
                  Authentication is not configured yet. Your email is stored
                  in this browser for the demo; no account is created.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-[#77776e]">
            Need access? Contact your workspace administrator.
          </p>
        </section>

        <p className="mt-6 text-center text-xs leading-5 text-[#85857b]">
          By continuing, you’re accessing the OrgInGraphs demo environment.
        </p>
      </div>

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-[#e8e6d9] py-5 text-xs text-[#77776e] sm:flex-row sm:items-center sm:justify-between">
        <span>© 2026 OrgInGraphs</span>
        <span>Organizational intelligence, made clear.</span>
      </footer>
    </main>
  );
}
 