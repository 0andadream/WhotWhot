"use client";

import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { SiteNav } from "@/components/SiteNav";
import { HeroCardFan } from "@/components/landing/HeroCardFan";
import { SplitHeadline, WHOT_EASE } from "@/components/landing/motion";

/**
 * Premium landing: centered hero, Whot card fan as visual star,
 * how-it-works + CTA. Framer Motion for entrances and fan.
 */
export default function HomePage() {
  const reduce = useReducedMotion();

  return (
    <div className="landing landing-premium">
      <SiteNav />

      <main className="prem-main">
        {/* ── Hero ── */}
        <section className="prem-hero">
          <motion.div
            className="prem-hero-copy"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <SplitHeadline
              className="prem-h1"
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
              className="prem-lede"
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 16, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.65, delay: 0.55, ease: WHOT_EASE }}
            >
              The card game Naija grew up with. Pick Two, Hold On, General Market.
              Now onchain with Megapot. Practice free or stake 1 ticket each and
              the winner walks with both.
            </motion.p>

            <motion.div
              className="prem-stats"
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 14, filter: "blur(6px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.75, ease: WHOT_EASE }}
            >
              <span>
                <strong>0</strong> wallet needed
              </span>
              <span className="prem-dot" aria-hidden>
                ·
              </span>
              <span>
                <strong>1</strong> ticket staked
              </span>
              <span className="prem-dot" aria-hidden>
                ·
              </span>
              <span>
                <strong>2</strong> confirms
              </span>
            </motion.div>
          </motion.div>

          <HeroCardFan />
        </section>

        {/* ── How it works ── */}
        <HowSection />
      </main>

      <footer className="prem-footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}

function HowSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });
  const reduce = useReducedMotion();
  const show = reduce || inView;

  const steps = [
    {
      num: "01",
      title: "Stake your tickets",
      body: "Each player locks 1 Megapot ticket NFT in escrow.",
    },
    {
      num: "02",
      title: "Play the game",
      body: "Classic Whot rules. First empty hand wins the table.",
    },
    {
      num: "03",
      title: "Claim the pot",
      body: "Dual confirm the winner. Both tickets transfer to that wallet.",
    },
  ];

  return (
    <section className="prem-how" ref={ref}>
      <div className="prem-how-inner">
        <div className="prem-how-left">
          <motion.p
            className="prem-how-eyebrow"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: WHOT_EASE }}
          >
            How it works
          </motion.p>
          <div className="prem-how-steps">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                className="prem-step"
                initial={
                  reduce ? false : { opacity: 0, y: 18, scale: 0.96 }
                }
                animate={
                  show
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 18, scale: 0.96 }
                }
                transition={{
                  duration: 0.55,
                  delay: reduce ? 0 : 0.12 + i * 0.12,
                  ease: WHOT_EASE,
                }}
              >
                <span className="prem-step-num">{s.num}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="prem-how-cta"
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={show ? { opacity: 1, scale: 1 } : {}}
          transition={{
            duration: 0.55,
            delay: reduce ? 0 : 0.45,
            ease: WHOT_EASE,
          }}
        >
          <motion.div
            whileHover={
              reduce
                ? undefined
                : {
                    scale: 1.05,
                    transition: { type: "spring", stiffness: 400, damping: 16 },
                  }
            }
            whileTap={reduce ? undefined : { scale: 0.97 }}
          >
            <Link href="/play" className="prem-cta-circle" aria-label="Play Whot">
              <span className="prem-cta-circle-label">Play</span>
              <span className="prem-cta-circle-sub">Start a game</span>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
