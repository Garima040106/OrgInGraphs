import { AppShell } from "@/components/layout/AppShell";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
