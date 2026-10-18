export const DEMO_SESSION_KEY = "oig-demo-workspace";
export const DEFAULT_DEMO_EMAIL = "demo@hirenova.com" as const;
export const DEMO_ACCOUNT_EMAILS = [DEFAULT_DEMO_EMAIL, "nickhil@hirenova.com"] as const;

export type DemoAccountEmail = (typeof DEMO_ACCOUNT_EMAILS)[number];

export function isDemoAccountEmail(value: unknown): value is DemoAccountEmail {
  return typeof value === "string" && (DEMO_ACCOUNT_EMAILS as readonly string[]).includes(value.trim().toLowerCase());
}

export function getDemoSession(): DemoAccountEmail | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(DEMO_SESSION_KEY)?.trim().toLowerCase();
  return isDemoAccountEmail(value) ? value : null;
}

export function setDemoSession(email: string): boolean {
  if (!isDemoAccountEmail(email)) return false;
  window.localStorage.setItem(DEMO_SESSION_KEY, email.trim().toLowerCase());
  return true;
}

export function clearDemoSession(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_SESSION_KEY);
}
