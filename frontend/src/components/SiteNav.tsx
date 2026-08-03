"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectButton } from "@/components/ConnectButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useLocalProfile } from "@/hooks/useMatchProfiles";

/**
 * Global nav: logo + Live on Base · Play · Guide · profile · Connect.
 */
export function SiteNav() {
  const path = usePathname() || "/";
  const onPlay = path.startsWith("/play");
  const onGuide = path.startsWith("/guide");
  const { profile } = useLocalProfile();

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
          className={`site-nav-pill${onPlay ? " active" : ""}`}
        >
          Play
        </Link>
        <Link
          href="/guide"
          className={`site-nav-pill${onGuide ? " active" : ""}`}
        >
          Guide
        </Link>
        {profile && (
          <button
            type="button"
            className="site-nav-profile"
            title="Edit profile"
            onClick={() =>
              window.dispatchEvent(new Event("whotwhot:editProfile"))
            }
          >
            <ProfileAvatar profile={profile} size={32} />
            <span className="site-nav-username">{profile.username}</span>
          </button>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}
