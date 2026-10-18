"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, friendlyApiError } from "@/lib/api";
import { integrationSummaries, unavailableIntegrationSummaries, type SourceSummary } from "@/lib/source-data";
import type { IntegrationSource } from "@/lib/types";

export type LiveSourceData = Record<"confluence" | "jira" | "slack" | "github", SourceSummary>;
const ids: IntegrationSource[] = ["confluence", "jira", "slack", "github"];
const initial = unavailableIntegrationSummaries("Connection check has not run yet.") as LiveSourceData;

export function useLiveSourceData(autoLoad = true) {
  const [sources, setSources] = useState<LiveSourceData>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await api.integrationStatus();
      const next = integrationSummaries(response);
      if (requestSequence === refreshSequence.current) {
        setSources(next);
        setError("");
        setLoading(false);
      }
      return true;
    } catch (cause) {
      const message = friendlyApiError(cause);
      if (requestSequence === refreshSequence.current) {
        setError(message);
        setSources(unavailableIntegrationSummaries(message) as LiveSourceData);
        setLoading(false);
      }
      return false;
    }
  }, []);

  useEffect(() => { if (autoLoad) void refresh(); }, [autoLoad, refresh]);
  return { sources, loading, error, refresh };
}
