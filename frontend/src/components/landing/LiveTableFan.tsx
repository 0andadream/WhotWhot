"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { WhotCard } from "@/components/WhotCard";
import type { Card } from "@/lib/whot/types";
import { WHOT_EASE } from "./motion";

const FAN_CARDS: Card[] = [
  { id: "f1", shape: "star", number: 8, special: "suspension" },
  { id: "f2", shape: "circle", number: 1, special: "hold_on" },
  { id: "f3", shape: "whot", number: 20, special: "whot" },
  { id: "f4", shape: "cross", number: 5, special: "pick_three" },
  { id: "f5", shape: "square", number: 14, special: "general_market" },
];

/** Resting fan pose (after deal) */
const REST = [
  { x: -88, y: 4, rotate: -16, rotateY: 8, z: 1 },
  { x: -44, y: -2, rotate: -8, rotateY: 4, z: 2 },
  { x: 0, y: -10, rotate: 0, rotateY: 0, z: 5 },
  { x: 44, y: -2, rotate: 8, rotateY: -4, z: 2 },
  { x: 88, y: 4, rotate: 16, rotateY: -8, z: 1 },
];

/** Hover fan: wider spread + light 3D tilt */
const SPREAD = [
  { x: -128, y: -12, rotate: -24, rotateY: 18, z: 1 },
  { x: -66, y: -20, rotate: -12, rotateY: 10, z: 3 },
  { x: 0, y: -28, rotate: 0, rotateY: 0, z: 6 },
  { x: 66, y: -20, rotate: 12, rotateY: -10, z: 3 },
  { x: 128, y: -12, rotate: 24, rotateY: -18, z: 1 },
];

/**
 * Demo table card fan: deal-in bounce, hover fan with perspective,
 * per-card lift. The star of landing motion.
 */
export function LiveTableFan() {
  const reduce = useReducedMotion();
  const [fanHover, setFanHover] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [dealt, setDealt] = useState(false);

  useEffect(() => {
    // Allow first paint, then mark dealt so hover transitions skip deal delay
    const t = window.setTimeout(() => setDealt(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="live-table"
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, ease: WHOT_EASE, delay: 0.35 }}
    >
      <div className="live-table-head">
        <span className="live-badge">Live</span>
        <span className="live-table-id">TABLE · DEMO</span>
      </div>

      <div
        className="card-fan card-fan-motion"
        aria-hidden
        onMouseEnter={() => setFanHover(true)}
        onMouseLeave={() => {
          setFanHover(false);
          setActive(null);
        }}
      >
        {FAN_CARDS.map((c, i) => {
          const pose = fanHover ? SPREAD[i] : REST[i];
          const isActive = active === i;

          return (
            <motion.div
              key={c.id}
              className="fan-card"
              style={{
                zIndex: isActive ? 20 : pose.z,
                transformStyle: "preserve-3d",
              }}
              initial={
                reduce
                  ? false
                  : {
                      opacity: 0,
                      x: 0,
                      y: 48,
                      rotate: (i - 2) * 4,
                      rotateY: 0,
                      scale: 0.55,
                    }
              }
              animate={{
                opacity: 1,
                x: pose.x,
                y: isActive ? pose.y - 14 : pose.y,
                rotate: pose.rotate,
                rotateY: pose.rotateY,
                scale: isActive ? 1.06 : fanHover && i === 2 ? 1.03 : 1,
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : dealt || fanHover
                    ? {
                        type: "spring",
                        stiffness: 340,
                        damping: 24,
                        mass: 0.8,
                      }
                    : {
                        type: "spring",
                        stiffness: 280,
                        damping: 16,
                        mass: 0.9,
                        delay: 0.2 + i * 0.08,
                      }
              }
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                style={{
                  filter: isActive
                    ? "drop-shadow(0 18px 28px rgba(0,0,0,0.55))"
                    : "drop-shadow(0 8px 18px rgba(0,0,0,0.42))",
                  transition: "filter 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <WhotCard card={c} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="live-table-caption">
        Classic Whot faces, star, circle, cross, triangle, square &amp; WHOT
        20. Hover to spread the fan.
      </p>
    </motion.div>
  );
}
