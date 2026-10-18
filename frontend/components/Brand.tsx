import Link from "next/link";
import Image from "next/image";

export function Brand({ href = "/", compact = false, showMark = true }: { href?: string; compact?: boolean; showMark?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="OrgInGraphs home">
      {showMark && <Image className="brand-mark-image" src="/img/logo.png" alt="" width={34} height={34} />}
      {!compact && (
        <span className="brand-wordmark">
          <span>orgingraphs</span>
        </span>
      )}
    </Link>
  );
}
