import React, { Fragment, createElement, type ReactNode } from "react";

function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function inlineMarkdown(text: string, onCitationClick?: (number: number) => void, citationCount = 0): ReactNode[] {
  const tokenPattern = /\[S\d+\]|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    let node: ReactNode = token;
    const citation = token.match(/^\[S(\d+)\]$/);
    if (citation) {
      const number = Number(citation[1]);
      node = number <= citationCount && onCitationClick
        ? createElement("button", { type: "button", className: "rag-inline-citation", "aria-label": `Show source ${number}`, onClick: () => onCitationClick(number) }, token)
        : createElement("span", { className: "rag-inline-citation" }, token);
    } else if (token.startsWith("**") || token.startsWith("__")) node = createElement("strong", null, token.slice(2, -2));
    else if (token.startsWith("*")) node = createElement("em", null, token.slice(1, -1));
    else if (token.startsWith("_")) node = createElement("em", null, token.slice(1, -1));
    else if (token.startsWith("`")) node = createElement("code", { className: "rag-inline-code" }, token.slice(1, -1));
    else {
      const separator = token.indexOf("](");
      const label = token.slice(1, separator);
      const href = safeLink(token.slice(separator + 2, -1));
      node = href
        ? createElement("a", { href, target: "_blank", rel: "noreferrer" }, label)
        : label;
    }
    nodes.push(createElement(Fragment, { key: `inline-${index++}` }, node));
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownAnswer({ text, onCitationClick, citationCount = 0 }: { text: string; onCitationClick?: (number: number) => void; citationCount?: number }) {
  if (!text.trim()) return <p className="agent-muted">No answer was returned.</p>;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim().split(/\s+/)[0];
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre className="rag-code-block" key={`code-${blocks.length}`}><code className={language ? `language-${language}` : undefined}>{code.join("\n")}</code></pre>);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const cells = (value: string) => value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) rows.push(cells(lines[i++]));
      blocks.push(<div className="rag-table-scroll" key={`table-${blocks.length}`} role="region" aria-label="Answer table" tabIndex={0}><table className="rag-markdown-table"><thead><tr>{headers.map((cell, index) => <th key={index}>{inlineMarkdown(cell, onCitationClick, citationCount)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, index) => <td key={index}>{inlineMarkdown(row[index] ?? "", onCitationClick, citationCount)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(createElement(`h${level}`, { className: "rag-markdown-heading", key: `heading-${blocks.length}` }, inlineMarkdown(heading[2], onCitationClick, citationCount)));
      i++;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = orderedList ? lines[i].match(/^\s*\d+[.)]\s+(.+)$/) : lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={`item-${items.length}`}>{inlineMarkdown(item[1], onCitationClick, citationCount)}</li>);
        i++;
      }
      blocks.push(createElement(orderedList ? "ol" : "ul", { className: "rag-markdown-list", key: `list-${blocks.length}` }, items));
      continue;
    }

    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^\s*#{1,6}\s+/.test(lines[i]) && !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[i])) paragraph.push(lines[i++].trim());
    blocks.push(<p className="rag-markdown-paragraph" key={`paragraph-${blocks.length}`}>{inlineMarkdown(paragraph.join(" "), onCitationClick, citationCount)}</p>);
  }
  return <div className="rag-markdown-answer">{blocks}</div>;
}
