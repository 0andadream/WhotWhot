"use client";

import type { Shape } from "@/lib/whot/types";

/** Classic Whot: bold geometric shapes in deep red on cream */
const RED = "#8B0000";
const RED_MID = "#C41E3A";
const CREAM = "#F8F1E3";

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
    className: "suit-icon",
  };

  switch (shape) {
    case "circle":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="27" fill={color} />
          <circle
            cx="32"
            cy="32"
            r="15"
            fill="none"
            stroke={CREAM}
            strokeWidth="3"
            opacity="0.28"
          />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="32,3 61,58 3,58" fill={color} />
          <polygon
            points="32,16 48,50 16,50"
            fill="none"
            stroke={CREAM}
            strokeWidth="2.5"
            opacity="0.28"
          />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path
            d="M22 4h20v18h18v20H42v18H22V42H4V22h18V4z"
            fill={color}
          />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="54" height="54" rx="4" fill={color} />
          <rect
            x="15"
            y="15"
            width="34"
            height="34"
            rx="2"
            fill="none"
            stroke={CREAM}
            strokeWidth="2.5"
            opacity="0.28"
          />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon
            points="32,2 39.5,22.5 61,24 44.5,37.5 50,58 32,47 14,58 19.5,37.5 3,24 24.5,22.5"
            fill={color}
          />
        </svg>
      );
    case "whot":
    default:
      return (
        <svg {...common}>
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={color}
            strokeWidth="4.5"
          />
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fill={RED_MID}
            fontSize="24"
            fontWeight="800"
            fontFamily="Georgia, 'Times New Roman', serif"
          >
            W
          </text>
        </svg>
      );
  }
}
