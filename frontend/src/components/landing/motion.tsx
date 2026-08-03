"use client";

import {
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

/** Shared easing: premium ease-out */
export const WHOT_EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: WHOT_EASE },
  },
};

export const fadeUpNoBlur: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: WHOT_EASE },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 16 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.55, ease: WHOT_EASE },
  },
};

export function useMotionSafe() {
  const reduce = useReducedMotion();
  return !reduce;
}

/** Section / block entrance once in view */
export function Reveal({
  children,
  className,
  as = "div",
  variants = fadeUpNoBlur,
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  variants?: Variants;
  delay?: number;
} & Omit<HTMLMotionProps<"div">, "children" | "variants">) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const animate = useMotionSafe();
  const Tag = as === "section" ? motion.section : motion.div;

  if (!animate) {
    const Static = as === "section" ? "section" : "div";
    return (
      <Static className={className} {...(rest as object)}>
        {children}
      </Static>
    );
  }

  return (
    <Tag
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={variants}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Staggered word headline */
export function SplitHeadline({
  words,
  className,
  highlightFrom,
}: {
  words: string[];
  className?: string;
  /** Index from which words get the .hl class */
  highlightFrom?: number;
}) {
  const animate = useMotionSafe();
  if (!animate) {
    return (
      <h1 className={className}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`}>
            {highlightFrom !== undefined && i >= highlightFrom ? (
              <span className="hl">{w}</span>
            ) : (
              w
            )}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </h1>
    );
  }

  return (
    <h1 className={className}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.12 + i * 0.08,
            ease: WHOT_EASE,
          }}
        >
          {highlightFrom !== undefined && i >= highlightFrom ? (
            <span className="hl">{w}</span>
          ) : (
            w
          )}
          {i < words.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </h1>
  );
}
