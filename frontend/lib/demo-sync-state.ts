"use client";

import { useSyncExternalStore } from "react";
import { DEMO_SYNC_ACTIVITY, DEMO_SYNC_SOURCES, type DemoSyncSource } from "@/lib/demo-data";

export type DemoSyncActivity = { source: string; detail: string; status: DemoSyncSource["status"]; when: string };
export type DemoSyncSnapshot = {
  statuses: Record<string, DemoSyncSource["status"]>;
  activity: DemoSyncActivity[];
  runningId: string | null;
};

const initialSnapshot: DemoSyncSnapshot = {
  statuses: Object.fromEntries(DEMO_SYNC_SOURCES.map((source) => [source.id, source.status])),
  activity: DEMO_SYNC_ACTIVITY,
  runningId: null,
};
let snapshot = initialSnapshot;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot;
const publish = (next: DemoSyncSnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };

export function useDemoSyncState() {
  return useSyncExternalStore(subscribe, getSnapshot, () => initialSnapshot);
}

export async function simulateDemoSync(source: DemoSyncSource) {
  if (snapshot.runningId) return false;
  publish({ ...snapshot, runningId: source.id, statuses: { ...snapshot.statuses, [source.id]: "Running" }, activity: [{ source: source.name, detail: "Demo synchronization started", when: "Just now · simulated", status: "Running" }, ...snapshot.activity] });
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  publish({ ...snapshot, runningId: null, statuses: { ...snapshot.statuses, [source.id]: "Completed" }, activity: [{ source: source.name, detail: "Demo synchronization completed", when: "Just now · simulated", status: "Completed" }, ...snapshot.activity.slice(1)] });
  return true;
}
