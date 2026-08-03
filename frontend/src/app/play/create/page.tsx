"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { useAccount, usePublicClient } from "wagmi";
import { useEscrowActions, useEscrowReady } from "@/hooks/useEscrow";
import { useTicketCount } from "@/hooks/useMegapot";
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import { decodeEventLog, type Address, isAddress } from "viem";

export default function CreateMatchPage() {
  const { address, isConnected } = useAccount();
  const { count } = useTicketCount();
  const escrowReady = useEscrowReady();
  const { createMatch, createChallenge, isPending } = useEscrowActions();
  const publicClient = usePublicClient({ chainId: 8453 });
  const router = useRouter();

  const [ticketId, setTicketId] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    setError(null);
    if (!ticketId.trim()) {
      setError("Enter your Megapot ticket token ID to stake.");
      return;
    }
    const id = BigInt(ticketId.trim());
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
    <div className="app-shell">
      <header className="header">
        <Link href="/" className="btn btn-ghost btn-sm connect-btn">
          ← Back
        </Link>
        <ConnectButton />
      </header>

      <div className="card-panel stack">
        <h2>Create match</h2>
        <p className="muted">
          Stake <strong>1 Megapot ticket</strong>. Opponent stakes another. Winner
          gets both NFTs.
        </p>

        <div className="ticket-badge">
          <div>
            <div className="muted">You have</div>
            <strong>{isConnected ? (count ?? "…") : "—"}</strong>
            <span className="muted"> tickets</span>
          </div>
        </div>

        {!escrowReady && (
          <div className="alert">
            Set <code>NEXT_PUBLIC_WHOT_ESCROW_ADDRESS</code> (
            {ADDRESSES.whotEscrow})
          </div>
        )}

        <label className="muted">Ticket token ID to stake</label>
        <input
          className="input"
          placeholder="e.g. 123456789…"
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
        />
        <p className="muted">
          Find IDs on Basescan / OpenSea (Megapot Tickets collection) or after a
          purchase event. We only show a count in the lobby — paste the id here
          to stake.
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
          disabled={!isConnected || !escrowReady || busy || isPending}
          onClick={onCreate}
        >
          {busy ? "Confirm in wallet…" : "Stake & create match"}
        </button>
        {error && <div className="alert">{error}</div>}
      </div>
    </div>
  );
}
