"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  href?: string;
  /** Show “WhotWhot” text next to mark */
  withWordmark?: boolean;
  /** Image size in px (square) */
  size?: number;
  className?: string;
};

/**
 * Square brand mark (MEGAPOT WHOT artwork) + optional text.
 */
export function BrandLogo({
  href = "/",
  withWordmark = true,
  size = 40,
  className = "",
}: Props) {
  const img = (
    <Image
      src="/logo.png"
      alt="WhotWhot"
      width={size}
      height={size}
      className="brand-logo-img"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 8,
        objectFit: "contain",
        background: "#8B0000",
      }}
      priority
      unoptimized
    />
  );

  const inner = (
    <span className={`brand-logo ${className}`.trim()}>
      {img}
      {withWordmark && <span className="brand-logo-text">WhotWhot</span>}
    </span>
  );

  if (!href || href === "") return inner;
  return (
    <Link href={href} className="brand-logo-link">
      {inner}
    </Link>
  );
}
