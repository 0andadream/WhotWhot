"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { WhotCard } from "@/components/WhotCard";
import type { Card } from "@/lib/whot/types";
import { FloatingWhotCards } from "./FloatingWhotCards";

/** Authentic shapes: circle, star, triangle, square, cross, WHOT 20 */
const HERO_CARDS: Card[] = [
  { id: "h1", shape: "circle", number: 7, special: null },
  { id: "h2", shape: "star", number: 5, special: "pick_three" },
  { id: "h3", shape: "triangle", number: 2, special: "pick_two" },
  { id: "h4", shape: "whot", number: 20, special: "whot" },
  { id: "h5", shape: "square", number: 14, special: "general_market" },
  { id: "h6", shape: "cross", number: 8, special: "suspension" },
];

/** Arc fan: 6 cards, elegant spread */
const REST = [
  { x: -150, y: 28, rotate: -28, rotateY: 14, z: 1 },
  { x: -90, y: 8, rotate: -16, rotateY: 8, z: 2 },
  { x: -32, y: -4, rotate: -6, rotateY: 3, z: 4 },
  { x: 32, y: -4, rotate: 6, rotateY: -3, z: 4 },
  { x: 90, y: 8, rotate: 16, rotateY: -8, z: 2 },
  { x: 150, y: 28, rotate: 28, rotateY: -14, z: 1 },
];

const SPREAD = [
  { x: -200, y: 18, rotate: -36, rotateY: 22, z: 1 },
  { x: -120, y: -8, rotate: -22, rotateY: 12, z: 3 },
  { x: -42, y: -22, rotate: -8, rotateY: 5, z: 5 },
  { x: 42, y: -22, rotate: 8, rotateY: -5, z: 5 },
  { x: 120, y: -8, rotate: 22, rotateY: -12, z: 3 },
  { x: 200, y: 18, rotate: 36, rotateY: -22, z: 1 },
];

/**
 * Centerpiece Whot fan. Floating background cards optional (landing only).
 */
export function HeroCardFan({
  showFloaters = true,
  compact = false,
}: {
  /** Soft floating cards behind the fan — landing page only */
  showFloaters?: boolean;
  /** Smaller stage for lobby / secondary screens */
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className={`hero-stage${compact ? " hero-stage-compact" : ""}`}>
      <div className="hero-glow g1" aria-hidden />
      <div className="hero-glow g2" aria-hidden />

      {showFloaters && <FloatingWhotCards variant="stage" />}

      <div
        className="hero-fan"
        aria-hidden
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setActive(null);
        }}
      >
        {HERO_CARDS.map((c, i) => {
          const pose = hover ? SPREAD[i] : REST[i];
          const isActive = active === i;
          return (
            <motion.div
              key={c.id}
              className="hero-fan-card"
              style={{
                zIndex: isActive ? 30 : pose.z + i,
                transformStyle: "preserve-3d",
              }}
              initial={
                reduce
                  ? false
                  : {
                      opacity: 0,
                      x: 0,
                      y: 80,
                      rotate: 0,
                      rotateY: 0,
                      scale: 0.5,
                    }
              }
              animate={{
                opacity: 1,
                x: pose.x,
                y: isActive ? pose.y - 16 : pose.y,
                rotate: pose.rotate,
                rotateY: pose.rotateY,
                scale: isActive ? 1.08 : hover && (i === 2 || i === 3) ? 1.04 : 1,
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      stiffness: 300,
                      damping: 20,
                      mass: 0.85,
                      delay: hover || isActive ? 0 : 0.25 + i * 0.07,
                    }
              }
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                className={`hero-card-shell${c.special === "whot" ? " is-whot" : ""}`}
              >
                <WhotCard card={c} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
