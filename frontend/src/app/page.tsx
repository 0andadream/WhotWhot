"use client";

import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { SiteNav } from "@/components/SiteNav";
import { LiveTableFan } from "@/components/landing/LiveTableFan";
import {
  Reveal,
  SplitHeadline,
  WHOT_EASE,
  fadeUp,
  scaleIn,
} from "@/components/landing/motion";

/**
 * Marketing landing: same copy/layout/colors; Framer Motion polish.
 */
export default function HomePage() {
  const reduce = useReducedMotion();

  return (
    <div className="landing">
      <SiteNav />

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <motion.div
              className="landing-eyebrow live"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: WHOT_EASE }}
            >
              Live on Base
            </motion.div>

            <motion.div
              className="landing-wordmark"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.06, ease: WHOT_EASE }}
            >
              WhotWhot
            </motion.div>

            <SplitHeadline
              className="landing-h1"
              words={[
                "Play",
                "Whot",
                "online,",
                "stake",
                "tickets,",
                "winner",
                "takes",
                "both",
              ]}
              highlightFrom={3}
            />

            <motion.p
              className="landing-lede"
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 16, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.55, ease: WHOT_EASE }}
            >
              The card game Naija grew up with. Pick Two, Hold On, General Market.
              Now onchain with Megapot. Practice free or stake 1 ticket each and
              the winner walks with both.
            </motion.p>

            <motion.div
              className="landing-ctas"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.7, ease: WHOT_EASE }}
            >
              <motion.div
                whileHover={
                  reduce
                    ? undefined
                    : {
                        scale: 1.05,
                        transition: { type: "spring", stiffness: 400, damping: 18 },
                      }
                }
                whileTap={reduce ? undefined : { scale: 0.98 }}
                className="inline-flex w-full sm:w-auto"
              >
                <Link
                  href="/play"
                  className="landing-btn landing-btn-primary landing-btn-glow w-full sm:w-auto"
                >
                  Play
                </Link>
              </motion.div>
              <Link href="/guide" className="landing-btn landing-btn-ghost">
                Play guide
              </Link>
            </motion.div>

            <motion.div
              className="rule-chips"
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 14, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.82, ease: WHOT_EASE }}
            >
              <span className="rule-chip">
                <strong>0</strong> wallet needed to practice
              </span>
              <span className="rule-chip">
                <strong>1</strong> ticket staked each
              </span>
              <span className="rule-chip">
                <strong>2</strong> confirms to settle
              </span>
            </motion.div>
          </div>

          <LiveTableFan />
        </div>
      </section>

      {/* ── How it works ── */}
      <HowItWorks />

      {/* ── Megapot trust ── */}
      <MegapotSection />

      <footer className="landing-footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const show = reduce || inView;

  const steps = [
    {
      num: "01",
      pip: "c1",
      title: "Tap Play",
      body: "Practice vs AI instantly, no wallet required for the demo table.",
    },
    {
      num: "02",
      pip: "c2",
      title: "Pick your mode",
      body: "Bots for practice, or stake one Megapot ticket each for real stakes.",
    },
    {
      num: "03",
      pip: "c3",
      title: "Winner takes both",
      body: "Escrow locks tickets; dual confirms the winner and both NFTs transfer.",
    },
  ];

  return (
    <section className="landing-section cream" ref={ref}>
      <div className="landing-section-inner" id="how">
        <Reveal>
          <div className="sec-eyebrow">How it works</div>
          <h2>From “Play” to your first hand, under a minute.</h2>
        </Reveal>

        <div className="how-steps">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              className="how-step"
              initial={
                reduce ? false : { opacity: 0, scale: 0.95, y: 18 }
              }
              animate={
                show
                  ? { opacity: 1, scale: 1, y: 0 }
                  : { opacity: 0, scale: 0.95, y: 18 }
              }
              transition={{
                duration: 0.55,
                delay: reduce ? 0 : 0.12 + i * 0.14,
                ease: WHOT_EASE,
              }}
            >
              <div className="how-step-badge">
                <motion.span
                  className="how-step-num"
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={show ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    duration: 0.45,
                    delay: reduce ? 0 : 0.08 + i * 0.14,
                    ease: WHOT_EASE,
                  }}
                >
                  {s.num}
                </motion.span>
                <span className={`how-step-pip ${s.pip}`} aria-hidden />
              </div>
              <motion.h4
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={show ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: reduce ? 0 : 0.2 + i * 0.14,
                  ease: WHOT_EASE,
                }}
              >
                {s.title}
              </motion.h4>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={show ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: reduce ? 0 : 0.28 + i * 0.14,
                  ease: WHOT_EASE,
                }}
              >
                {s.body}
              </motion.p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MegapotSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const show = reduce || inView;

  const nodes = [
    {
      icon: <LockIcon />,
      iconClass: "",
      title: "Lock ticket",
      body: "Each player stakes 1 Megapot ticket into escrow.",
    },
    {
      icon: <CardsIcon />,
      iconClass: "brick",
      title: "Match plays out",
      body: "Classic Whot rules, first empty hand wins.",
    },
    {
      icon: <WinIcon />,
      iconClass: "moss",
      title: "Winner takes both",
      body: "Both tickets transfer after dual confirm.",
    },
  ];

  return (
    <section className="landing-section surface" ref={ref}>
      <div className="landing-section-inner" id="megapot">
        <div className="escrow-panel">
          <Reveal variants={fadeUp}>
            <div className="sec-eyebrow">Megapot</div>
            <h2>Tickets as stakes</h2>
            <p className="sec-sub">
              Each player locks 1 Megapot ticket NFT in escrow. When the Whot match
              ends and both confirm the winner, both tickets transfer to that wallet.
            </p>
          </Reveal>

          <div className="escrow-flow">
            {nodes.flatMap((n, i) => {
              const node = (
                <motion.div
                  key={n.title}
                  className="escrow-node"
                  initial={
                    reduce ? false : { opacity: 0, y: 20, scale: 0.96 }
                  }
                  animate={
                    show
                      ? { opacity: 1, y: 0, scale: 1 }
                      : { opacity: 0, y: 20, scale: 0.96 }
                  }
                  transition={{
                    duration: 0.55,
                    delay: reduce ? 0 : 0.2 + i * 0.22,
                    ease: WHOT_EASE,
                  }}
                >
                  <motion.div
                    className={`escrow-icon ${n.iconClass}`.trim()}
                    aria-hidden
                    animate={
                      reduce
                        ? undefined
                        : {
                            y: [0, -5, 0],
                          }
                    }
                    transition={
                      reduce
                        ? undefined
                        : {
                            duration: 3.2 + i * 0.35,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.4,
                          }
                    }
                  >
                    {n.icon}
                  </motion.div>
                  <h4>{n.title}</h4>
                  <p>{n.body}</p>
                </motion.div>
              );
              if (i === 0) return [node];
              return [
                <motion.div
                  key={`arr-${n.title}`}
                  className="escrow-arrow"
                  aria-hidden
                  initial={reduce ? false : { opacity: 0 }}
                  animate={show ? { opacity: 1 } : {}}
                  transition={{
                    duration: 0.4,
                    delay: reduce ? 0 : 0.28 + i * 0.22,
                  }}
                >
                  <span>→ →</span>
                </motion.div>,
                node,
              ];
            })}
          </div>

          <Reveal variants={scaleIn} delay={0.15}>
            <div className="escrow-cta">
              <motion.div
                whileHover={
                  reduce
                    ? undefined
                    : {
                        scale: 1.05,
                        transition: {
                          type: "spring",
                          stiffness: 400,
                          damping: 18,
                        },
                      }
                }
                whileTap={reduce ? undefined : { scale: 0.98 }}
                className="inline-flex"
              >
                <Link
                  href="/play"
                  className="landing-btn landing-btn-primary landing-btn-glow"
                >
                  Go to play
                </Link>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="12" height="16" rx="2" />
      <path d="M10 3h8a2 2 0 0 1 2 2v14" />
    </svg>
  );
}

function WinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 9H5a3 3 0 0 0 3 3M17 9h2a3 3 0 0 1-3 3" />
    </svg>
  );
}
