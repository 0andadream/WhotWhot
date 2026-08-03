"use client";

import { WhotCard } from "@/components/WhotCard";
import type { Card } from "@/lib/whot/types";

type GuideEntry = {
  card: Card;
  title: string;
  aka?: string;
  body: string;
};

const SPECIALS: GuideEntry[] = [
  {
    card: { id: "g1", shape: "circle", number: 1, special: "hold_on" },
    title: "1: Hold On",
    aka: "Play again",
    body: "After you play a 1, you play again immediately. Use it to keep pressure or empty your hand faster.",
  },
  {
    card: { id: "g2", shape: "triangle", number: 2, special: "pick_two" },
    title: "2: Pick Two",
    aka: "Attack",
    body: "The next player must draw 2 cards, unless they play another 2 to stack the penalty (Pick 2 + Pick 2 = draw 4, and so on).",
  },
  {
    card: { id: "g5", shape: "cross", number: 5, special: "pick_three" },
    title: "5: Pick Three",
    aka: "Strong attack",
    body: "The next player draws 3 cards, unless they stack another 5. Stacks only with other Pick Threes, not with Pick Twos.",
  },
  {
    card: { id: "g8", shape: "star", number: 8, special: "suspension" },
    title: "8: Suspension",
    aka: "Skip",
    body: "The next player is suspended (skipped). In a 2-player game you effectively get another turn after the skip.",
  },
  {
    card: { id: "g14", shape: "square", number: 14, special: "general_market" },
    title: "14: General Market",
    aka: "Market",
    body: "Your opponent goes to market and draws 1 card from the pile. A classic Naija special.",
  },
  {
    card: { id: "g20", shape: "whot", number: 20, special: "whot" },
    title: "20: Whot",
    aka: "Wild",
    body: "Play anytime. Call any shape (Circle, Triangle, Cross, Square, or Star). The next player must match that shape or play another Whot.",
  },
];

const SHAPES: { card: Card; name: string }[] = [
  { card: { id: "s1", shape: "circle", number: 7, special: null }, name: "Circle" },
  { card: { id: "s2", shape: "triangle", number: 3, special: null }, name: "Triangle" },
  { card: { id: "s3", shape: "cross", number: 11, special: null }, name: "Cross" },
  { card: { id: "s4", shape: "square", number: 10, special: null }, name: "Square" },
  { card: { id: "s5", shape: "star", number: 4, special: null }, name: "Star" },
];

/**
 * Visual play guide: how to match + every special card.
 */
export function PlayGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`play-guide${compact ? " compact" : ""}`}>
      <section className="guide-block">
        <h2 className="guide-heading">How to win</h2>
        <p className="guide-lead">
          Be the first to empty your hand. On your turn, play one card that matches
          the top of the pile by <strong>shape</strong> or <strong>number</strong>.
          If you cannot play, go to market (draw 1) and your turn ends.
        </p>
        <ul className="guide-list">
          <li>Match the top card’s shape (e.g. Circle on Circle).</li>
          <li>Or match its number (e.g. 7 on any other 7).</li>
          <li>Whot (20) can be played on anything, then you call a shape.</li>
          <li>Legal cards glow orange so you can see what you can play.</li>
        </ul>
      </section>

      <section className="guide-block">
        <h2 className="guide-heading">The five shapes</h2>
        <p className="guide-lead">
          Classic Whot suits, cream faces, bold red geometry.
        </p>
        <div className="guide-shape-row">
          {SHAPES.map(({ card, name }) => (
            <div key={card.id} className="guide-shape-item">
              <WhotCard card={card} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-block">
        <h2 className="guide-heading">Special cards</h2>
        <p className="guide-lead">
          These numbers always have an effect when played (on any shape that has that number).
        </p>
        <div className="guide-special-grid">
          {SPECIALS.map((entry) => (
            <article key={entry.card.id} className="guide-special-card">
              <div className="guide-special-art">
                <WhotCard card={entry.card} />
              </div>
              <div className="guide-special-copy">
                <h3>{entry.title}</h3>
                {entry.aka && <span className="guide-aka">{entry.aka}</span>}
                <p>{entry.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-block">
        <h2 className="guide-heading">Stacking & defence</h2>
        <ul className="guide-list">
          <li>
            <strong>Pick Two</strong> stacks with Pick Two. <strong>Pick Three</strong> stacks
            with Pick Three only.
          </li>
          <li>
            If you cannot (or will not) stack a pick, accept the penalty and draw the cards.
          </li>
          <li>
            Hold On and Suspension let you keep tempo; General Market forces a single draw.
          </li>
        </ul>
      </section>

      {!compact && (
        <section className="guide-block guide-stake">
          <h2 className="guide-heading">Onchain stakes (WhotWhot)</h2>
          <p className="guide-lead">
            Optional: each player stakes 1 Megapot ticket. When both confirm the winner,
            both tickets transfer to that player. Practice vs AI never needs a wallet.
          </p>
        </section>
      )}
    </div>
  );
}
