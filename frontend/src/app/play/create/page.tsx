"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { NameField } from "@/components/NameField";
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
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import { decodeEventLog, type Address, isAddress } from "viem";

export default function CreateMatchPage() {
  const { isConnected } = useAccount();
  const { tickets, loading, error: loadError, count } = useUserTickets();
  const escrowReady = useEscrowReady();
  const { createMatch, createChallenge, isPending } = useEscrowActions();
  const publicClient = usePublicClient({ chainId: 8453 });
  const router = useRouter();

  const [ticketId, setTicketId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(getSavedDisplayName());
  }, []);

  const onCreate = async () => {
    setError(null);
    const name = sanitizeName(displayName || getSavedDisplayName());
    if (!name) {
      setError("Enter a name so your opponent knows who you are.");
      return;
    }
    if (!ticketId) {
      setError("Tap a ticket below to stake it.");
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
      setError("Match created — check open lobby if redirect failed.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ds">
      <SiteNav />
      <div className="app-shell shell-wide">
      <header className="header">
        <Link href="/play" className="btn btn-ghost btn-sm">
          ← Play
        </Link>
      </header>

      <div className="card-panel stack panel-narrow">
        <h2>Create match</h2>
        <p className="muted">
          Stake <strong>1 Megapot ticket</strong>. Opponent stakes another. Winner
          gets both NFTs.
        </p>

        <NameField value={displayName} onChange={setDisplayName} />

        <div className="ticket-badge">
          <div>
            <div className="muted">You have</div>
            <strong>{isConnected ? count : "—"}</strong>
            <span className="muted"> tickets</span>
          </div>
        </div>

        {!escrowReady && (
          <div className="alert">
            Escrow not configured ({ADDRESSES.whotEscrow})
          </div>
        )}

        {!isConnected ? (
          <p className="muted">Connect your wallet to see your tickets.</p>
        ) : (
          <TicketPicker
            tickets={tickets}
            loading={loading}
            error={loadError}
            selectedId={ticketId}
            onSelect={setTicketId}
          />
        )}

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
      </div>
      </div>
    </div>
  );
}
