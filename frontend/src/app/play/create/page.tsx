"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAccount, usePublicClient } from "wagmi";
import {
  useEscrowActions,
  useEscrowReady,
  rememberMatchId,
} from "@/hooks/useEscrow";
import { useUserTickets } from "@/hooks/useUserTickets";
import {
  getSavedDisplayName,
  sanitizeName,
  saveDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";
import {
  defaultUsername,
  ensureProfile,
  getProfile,
} from "@/lib/profile";
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import { decodeEventLog, type Address, isAddress } from "viem";

export default function CreateMatchPage() {
  const { isConnected, address } = useAccount();
  const {
    stakeableTickets,
    loading,
    error: loadError,
    stakeableCount,
  } = useUserTickets();
  const escrowReady = useEscrowReady();
  const { createMatch, createChallenge, isPending } = useEscrowActions();
  const publicClient = usePublicClient({ chainId: 8453 });
  const router = useRouter();

  const [ticketId, setTicketId] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = address
    ? getProfile(address) || {
        username: defaultUsername(address),
        avatar: "🃏",
        color: "#c41e3a",
      }
    : null;

  const onCreate = async () => {
    setError(null);
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }
    const ensured = ensureProfile(address);
    const name = sanitizeName(
      ensured.username || getSavedDisplayName() || defaultUsername(address)
    );
    if (!name) {
      setError("Could not resolve your username. Open profile in the nav.");
      return;
    }
    if (!ticketId) {
      setError("Tap a ticket below to stake it.");
      return;
    }
    const chosen = stakeableTickets.find(
      (t) => t.ticketId.toString() === ticketId
    );
    if (!chosen) {
      setError(
        "That ticket is from a draw that already finished. Buy a fresh Megapot ticket for the current round."
      );
      return;
    }
    saveDisplayName(name);
    const id = BigInt(ticketId);
    setBusy(true);
    try {
      let hash: `0x${string}`;
      if (challenge.trim() && isAddress(challenge.trim())) {
        hash = await createChallenge(id, challenge.trim() as Address);
      } else {
        hash = await createMatch(id);
      }

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: whotEscrowAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "MatchCreated") {
              const matchId = (decoded.args as { matchId: bigint }).matchId;
              rememberMatchId(matchId);
              setMatchPlayerName(matchId.toString(), "p1", name);
              router.push(`/play/match/${matchId.toString()}`);
              return;
            }
          } catch {
            /* not our event */
          }
        }
      }
      setError("Match created. Check open lobby if redirect failed.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing-premium ds">
      <SiteNav />
      <div className="app-shell shell-wide create-desk">
        <header className="header create-desk-header">
          <Link href="/play" className="btn btn-ghost btn-sm">
            ← Play
          </Link>
          {profile && isConnected && (
            <div className="create-desk-you">
              <ProfileAvatar profile={profile} size={36} />
              <div>
                <strong>{profile.username}</strong>
                <span className="muted">Playing as</span>
              </div>
            </div>
          )}
        </header>

        <div className="create-desk-grid">
          <section className="card-panel stack create-desk-main">
            <h2>Create match</h2>
            <p className="muted">
              Stake <strong>1 Megapot ticket</strong>. Opponent stakes another.
              Winner gets both NFTs.
            </p>

            <div className="ticket-badge">
              <div>
                <div className="muted">Open-draw tickets (stakeable)</div>
                <strong>{isConnected ? stakeableCount : "-"}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Only tickets for the <strong>current Megapot round</strong> can be
              staked. After you view draw results, no-win NFTs are hidden here so
              they are not mistaken for a fresh bet.
            </p>

            {!escrowReady && (
              <div className="alert">
                Escrow not configured ({ADDRESSES.whotEscrow})
              </div>
            )}

            {!isConnected ? (
              <p className="muted">Connect your wallet to see your tickets.</p>
            ) : (
              <TicketPicker
                tickets={stakeableTickets}
                loading={loading}
                error={loadError}
                selectedId={ticketId}
                onSelect={setTicketId}
              />
            )}
          </section>

          <aside className="card-panel stack create-desk-side">
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
              Table options
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Leave blank for a public open table. Optionally challenge a wallet
              directly.
            </p>

            <label className="muted">Challenge address (optional)</label>
            <input
              className="input"
              placeholder="0x…"
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
            />

            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !isConnected || !escrowReady || !ticketId || busy || isPending
              }
              onClick={onCreate}
            >
              {busy ? "Confirm in wallet…" : "Stake & create match"}
            </button>
            {error && <div className="alert">{error}</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}
