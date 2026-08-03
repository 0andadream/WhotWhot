"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectButton } from "@/components/ConnectButton";

/**
 * Shared nav: same as homepage (logo, Play/Guide, Base pill, Connect).
 */
export function SiteNav() {
  const path = usePathname() || "/";

  return (
    <nav className="landing-nav">
      <BrandLogo size={36} />
      <div className="nav-links">
        <Link href="/play" className={path.startsWith("/play") ? "active" : ""}>
          Play
        </Link>
        <Link href="/guide" className={path.startsWith("/guide") ? "active" : ""}>
          Guide
        </Link>
      </div>
      <div className="nav-spacer" />
      <span className="base-pill" title="Network">
        Base
      </span>
      <ConnectButton />
    </nav>
  );
}
