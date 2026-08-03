"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectButton } from "@/components/ConnectButton";

/**
 * Global nav (all pages): logo + Live on Base · circular Play · Guide · Connect.
 */
export function SiteNav() {
  const path = usePathname() || "/";
  const onPlay = path.startsWith("/play");
  const onGuide = path.startsWith("/guide");

  return (
    <nav className="site-nav" aria-label="Main">
      <div className="site-nav-left">
        <BrandLogo size={34} />
        <span className="site-nav-live">
          <span className="site-nav-live-dot" aria-hidden />
          Live on Base
        </span>
      </div>
      <div className="site-nav-right">
        <Link
          href="/play"
          className={`site-nav-play-circle${onPlay ? " active" : ""}`}
          title="Play"
        >
          Play
        </Link>
        <Link
          href="/guide"
          className={`site-nav-link${onGuide ? " active" : ""}`}
        >
          Guide
        </Link>
        <ConnectButton />
      </div>
    </nav>
  );
}
