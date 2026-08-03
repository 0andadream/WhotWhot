"use client";

import type { Shape } from "@/lib/whot/types";

/** Traditional Whot: bold geometric shapes in deep red */
const RED = "#8B0000";
const RED_MID = "#C41E3A";

export function SuitIcon({
  shape,
  size = 40,
  color = RED,
}: {
  shape: Shape;
  size?: number;
  color?: string;
}) {
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
          <circle cx="32" cy="32" r="26" fill={color} />
          <circle cx="32" cy="32" r="14" fill="none" stroke="#F8F1E3" strokeWidth="3.5" opacity="0.35" />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="32,4 60,58 4,58" fill={color} />
          <polygon
            points="32,18 48,50 16,50"
            fill="none"
            stroke="#F8F1E3"
            strokeWidth="2.5"
            opacity="0.3"
          />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path
            d="M24 4h16v20h20v16H40v20H24V40H4V24h20V4z"
            fill={color}
          />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="52" height="52" rx="3" fill={color} />
          <rect
            x="16"
            y="16"
            width="32"
            height="32"
            rx="1"
            fill="none"
            stroke="#F8F1E3"
            strokeWidth="2.5"
            opacity="0.3"
          />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon
            points="32,2 40,24 64,24 45,38 52,60 32,46 12,60 19,38 0,24 24,24"
            fill={color}
          />
        </svg>
      );
    case "whot":
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4" />
          <text
            x="32"
            y="41"
            textAnchor="middle"
            fill={RED_MID}
            fontSize="22"
            fontWeight="800"
            fontFamily="Georgia, serif"
          >
            W
          </text>
        </svg>
      );
  }
}
