"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDemoSession } from "@/lib/demo-auth";

export function WorkspaceAuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (getDemoSession()) setAuthorized(true);
    else router.replace("/login");
  }, [router]);

  if (!authorized) return <main className="workspace-auth-loading" aria-live="polite">Checking demo workspace session…</main>;
  return children;
}
