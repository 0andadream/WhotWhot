/**
 * Short chime when the opponent plays (Web Audio, no asset file).
 * Browsers require a user gesture before audio unlocks.
 */

const MUTE_KEY = "whotwhot:moveSoundMuted";

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

export function isMoveSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMoveSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Call on first board tap / button so later chimes are allowed. */
export function unlockMoveSound() {
  const ctx = getCtx();
  if (!ctx) return;
  unlocked = true;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

/**
 * Pleasant two-note chime: “opponent moved, your turn.”
 */
export function playOpponentMoveSound() {
  if (typeof window === "undefined") return;
  if (isMoveSoundMuted()) return;

  const ctx = getCtx();
  if (!ctx) return;

  const run = () => {
    try {
      const now = ctx.currentTime;
      const playTone = (
        freq: number,
        start: number,
        dur: number,
        gainPeak: number
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(gainPeak, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      // C6 → E6 soft chime
      playTone(1046.5, 0, 0.14, 0.12);
      playTone(1318.5, 0.1, 0.22, 0.1);
    } catch {
      /* autoplay / closed context */
    }
  };

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(() => {
        unlocked = true;
        run();
      })
      .catch(() => {});
    return;
  }

  if (!unlocked) {
    // Still try; may work if user already interacted elsewhere
    unlocked = true;
  }
  run();
}
