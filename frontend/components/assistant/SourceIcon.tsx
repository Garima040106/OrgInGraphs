"use client";

import { Database } from "lucide-react";
import React from "react";
import { useState } from "react";

const providerAssets: Record<string, { src: string; label: string }> = {
  confluence: { src: "/img/confluence.png", label: "Confluence" },
  jira: { src: "/img/jira.webp", label: "Jira" },
  slack: { src: "/img/slack.png", label: "Slack" },
  github: { src: "/img/github.png", label: "GitHub" },
};

export function SourceIcon({ sourceType, className = "" }: { sourceType?: string; className?: string }) {
  const provider = sourceType?.toLowerCase() ?? "";
  const asset = providerAssets[provider];
  const [failed, setFailed] = useState(false);

  if (!asset || failed) {
    return <span className={`source-icon-fallback ${className}`} role="img" aria-label={`${asset?.label ?? sourceType ?? "Company"} source`}>
      <Database size={15} aria-hidden="true" />
    </span>;
  }

  return <span className={`source-icon ${className}`}>
    <img src={asset.src} alt={`${asset.label} logo`} width={20} height={20} loading="lazy" onError={() => setFailed(true)} />
  </span>;
}
