"use client";

import type { Shape } from "@/lib/whot/types";

const COLORS: Record<Shape, string> = {
  circle: "#c41e3a",
  triangle: "#1e5bb8",
  cross: "#1b7a3d",
  square: "#6b2d8b",
  star: "#d97706",
  whot: "#7a1a12",
};

export function SuitIcon({
  shape,
  size = 40,
}: {
  shape: Shape;
  size?: number;
}) {
  const c = COLORS[shape] || COLORS.circle;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    "aria-hidden": true as const,
  };

  switch (shape) {
    case "circle":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="22" fill={c} />
          <circle cx="32" cy="32" r="12" fill="none" stroke="#fff" strokeWidth="3" opacity="0.35" />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="32,8 56,54 8,54" fill={c} />
          <polygon points="32,20 46,48 18,48" fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.3" />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <rect x="24" y="8" width="16" height="48" rx="3" fill={c} />
          <rect x="8" y="24" width="48" height="16" rx="3" fill={c} />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="12" y="12" width="40" height="40" rx="4" fill={c} />
          <rect x="20" y="20" width="24" height="24" rx="2" fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.3" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon
            points="32,6 38,24 58,24 42,36 48,54 32,43 16,54 22,36 6,24 26,24"
            fill={c}
          />
        </svg>
      );
    case "whot":
    default:
      return (
        <svg {...common}>
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fill={c}
            fontSize="22"
            fontWeight="900"
            fontFamily="system-ui,sans-serif"
          >
            W
          </text>
        </svg>
      );
  }
}
