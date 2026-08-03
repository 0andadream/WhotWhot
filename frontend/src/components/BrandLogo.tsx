"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  href?: string;
  /** Show “WhotWhot” word next to mark */
  withWordmark?: boolean;
  /** Image size in px */
  size?: number;
  className?: string;
};

/**
 * Official WW monogram logo (circular deep red + cream).
 */
export function BrandLogo({
  href = "/",
  withWordmark = true,
  size = 36,
  className = "",
}: Props) {
  const inner = (
    <span className={`brand-logo ${className}`.trim()}>
      <Image
        src="/logo.png"
        alt="WhotWhot"
        width={size}
        height={size}
        className="brand-logo-img"
        priority
      />
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
