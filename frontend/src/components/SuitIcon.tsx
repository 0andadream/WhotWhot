"use client";

import type { Shape } from "@/lib/whot/types";

/** Classic original Whot: all shapes in bold red on cream */
const RED = "#b71c1c";

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
          <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="5" />
          <circle cx="32" cy="32" r="14" fill={color} />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <polygon
            points="32,6 58,56 6,56"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <polygon points="32,18 48,50 16,50" fill={color} />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path
            d="M22 8h20v14h14v20H42v14H22V42H8V22h14V8z"
            fill={color}
          />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect
            x="10"
            y="10"
            width="44"
            height="44"
            rx="2"
            fill="none"
            stroke={color}
            strokeWidth="5"
          />
          <rect x="18" y="18" width="28" height="28" rx="1" fill={color} />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon
            points="32,4 39,24 60,24 43,37 50,58 32,45 14,58 21,37 4,24 25,24"
            fill={color}
          />
        </svg>
      );
    case "whot":
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="4" />
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fill={color}
            fontSize="20"
            fontWeight="900"
            fontFamily="Georgia, 'Times New Roman', serif"
          >
            W
          </text>
        </svg>
      );
  }
}
