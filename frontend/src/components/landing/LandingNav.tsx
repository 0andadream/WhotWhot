"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectButton } from "@/components/ConnectButton";

/**
 * Landing-only nav: logo + Live on Base · TABLE DEMO pill · connect.
 */
export function LandingNav() {
  return (
    <nav className="lnav">
      <div className="lnav-left">
        <BrandLogo size={34} />
        <span className="lnav-live">
          <span className="lnav-live-dot" aria-hidden />
          Live on Base
        </span>
      </div>
      <div className="lnav-right">
        <span className="lnav-table-pill">Live TABLE → DEMO</span>
        <Link href="/play" className="lnav-play-link">
          Play
        </Link>
        <Link href="/guide" className="lnav-play-link muted">
          Guide
        </Link>
        <ConnectButton />
      </div>
    </nav>
  );
}
