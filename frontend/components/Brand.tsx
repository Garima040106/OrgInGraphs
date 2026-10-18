import Link from "next/link";

export function Brand({ href = "/", compact = false, showMark = true }: { href?: string; compact?: boolean; showMark?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="OrgInGraphs home">
      {showMark && <span className="brand-mark">O</span>}
      {!compact && (
        <span className="brand-wordmark">
          <strong>oig</strong>
          <span>orgingraphs</span>
        </span>
      )}
    </Link>
  );
}
