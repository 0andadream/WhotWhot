"use client";

import { motion, useReducedMotion } from "framer-motion";
import { WhotCard } from "@/components/WhotCard";
import type { Card } from "@/lib/whot/types";

type Floater = {
  card: Card;
  className: string;
  delay: number;
  rot: [number, number, number];
};

const FLOATERS: Floater[] = [
  {
    card: { id: "bg1", shape: "circle", number: 1, special: "hold_on" },
    className: "hero-float f1",
    delay: 0,
    rot: [-18, -14, -18],
  },
  {
    card: { id: "bg2", shape: "star", number: 3, special: null },
    className: "hero-float f2",
    delay: 0.4,
    rot: [12, 16, 12],
  },
  {
    card: { id: "bg3", shape: "triangle", number: 11, special: null },
    className: "hero-float f3",
    delay: 0.8,
    rot: [-10, -6, -10],
  },
  {
    card: { id: "bg4", shape: "cross", number: 5, special: "pick_three" },
    className: "hero-float f4",
    delay: 1.2,
    rot: [14, 18, 14],
  },
  {
    card: { id: "bg5", shape: "whot", number: 20, special: "whot" },
    className: "hero-float f5",
    delay: 0.6,
    rot: [-8, -12, -8],
  },
  {
    card: { id: "bg6", shape: "square", number: 14, special: "general_market" },
    className: "hero-float f6",
    delay: 1.0,
    rot: [10, 6, 10],
  },
];

/**
 * Soft floating Whot cards for depth (landing hero + guide backdrop).
 * @param variant "stage" = inside hero-stage; "page" = fixed page background
 */
export function FloatingWhotCards({
  variant = "stage",
}: {
  variant?: "stage" | "page";
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  const list = variant === "page" ? FLOATERS : FLOATERS.slice(0, 4);

  return (
    <div
      className={
        variant === "page" ? "float-layer float-layer-page" : "float-layer"
      }
      aria-hidden
    >
      {list.map((f) => (
        <motion.div
          key={f.card.id}
          className={f.className}
          initial={{ opacity: 0 }}
          animate={{
            opacity: variant === "page" ? 0.16 : 0.22,
            y: [0, -12, 0],
            rotate: f.rot,
          }}
          transition={{
            opacity: { duration: 0.9, delay: 0.35 + f.delay },
            y: {
              duration: 5 + f.delay,
              repeat: Infinity,
              ease: "easeInOut",
              delay: f.delay,
            },
            rotate: {
              duration: 7 + f.delay,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        >
          <WhotCard card={f.card} />
        </motion.div>
      ))}
    </div>
  );
}
