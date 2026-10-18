import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceAuthGate } from "@/components/auth/WorkspaceAuthGate";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceAuthGate><AppShell>{children}</AppShell></WorkspaceAuthGate>;
}
