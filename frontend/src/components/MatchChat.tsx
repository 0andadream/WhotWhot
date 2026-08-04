"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { fetchChat, postChat, type ChatMessage } from "@/lib/matchChatClient";
import { playOpponentMoveSound, unlockMoveSound } from "@/lib/moveSound";
import {
  loadCachedChat,
  mergeChatMessages,
  saveCachedChat,
} from "@/lib/matchShareCache";

const MAX_TEXT = 280;

type Props = {
  matchId: string;
  address?: Address;
  displayName: string;
  /** Waiting or Active — chat allowed for players */
  canChat: boolean;
  isPlayer: boolean;
};

function formatTime(at: number) {
  try {
    return new Date(at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MatchChat({
  matchId,
  address,
  displayName,
  canChat,
  isPlayer,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<"redis" | "memory" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const readyRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const me = address?.toLowerCase();

  const applyMessages = useCallback(
    (incoming: ChatMessage[] | undefined | null) => {
      setMessages((prev) => {
        const merged = mergeChatMessages(prev, incoming);
        saveCachedChat(matchId, merged);
        return merged;
      });
    },
    [matchId]
  );

  const pull = useCallback(async () => {
    try {
      const data = await fetchChat(matchId);
      if (data.storage) setStorage(data.storage);
      const list = data.messages || [];

      // Soft chime on new messages from opponent (by count of merged unique)
      if (readyRef.current && me && list.length > 0) {
        const prevIds = new Set(messagesRef.current.map((m) => m.id));
        const fresh = list.filter(
          (m) => !prevIds.has(m.id) && !m.id.startsWith("local-")
        );
        if (fresh.some((m) => m.address.toLowerCase() !== me)) {
          playOpponentMoveSound();
        }
      }
      // Never wipe with empty poll
      if (list.length > 0) {
        applyMessages(list);
        lastCountRef.current = Math.max(lastCountRef.current, list.length);
      }
      readyRef.current = true;
      if (data.storage === "redis") setError(null);
    } catch (e) {
      // Keep existing messages on pull failure
      setError(e instanceof Error ? e.message : "Chat offline");
    }
  }, [matchId, me, applyMessages]);

  // Hydrate from localStorage first
  useEffect(() => {
    const cached = loadCachedChat(matchId);
    if (cached.length) {
      setMessages(cached);
      lastCountRef.current = cached.length;
    }
    readyRef.current = false;
    void pull();
    const id = window.setInterval(() => void pull(), 2500);
    return () => window.clearInterval(id);
  }, [matchId, pull]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!address || !isPlayer || !canChat) return;
    const t = text.trim();
    if (!t || sending) return;
    unlockMoveSound();
    setSending(true);
    setError(null);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      address: address.toLowerCase(),
      name: displayName || "You",
      text: t,
      at: Date.now(),
    };
    applyMessages([optimistic]);
    setText("");
    try {
      const data = await postChat(matchId, address, t, displayName);
      if (data.storage) setStorage(data.storage);
      applyMessages(data.messages || []);
      lastCountRef.current = Math.max(
        lastCountRef.current,
        (data.messages || []).length
      );
      if (data.storage === "memory") {
        setError(
          "Shared chat needs Redis on Vercel (Upstash). Messages may not reach the other player yet."
        );
      }
    } catch (err) {
      // Keep optimistic message; show error
      setError(err instanceof Error ? err.message : "Send failed — retrying…");
      // Retry once
      try {
        await new Promise((r) => setTimeout(r, 800));
        const data = await postChat(matchId, address, t, displayName);
        applyMessages(data.messages || []);
        setError(null);
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : "Send failed");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="match-chat card-panel" aria-label="Match chat">
      <div className="match-chat-head">
        <h3 className="match-chat-title">Live chat</h3>
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          {storage === "memory"
            ? "temp storage"
            : storage === "redis"
              ? "live"
              : "…"}
        </span>
      </div>

      {!isPlayer && (
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
          Connect as a match player to chat.
        </p>
      )}

      <div className="match-chat-log">
        {messages.length === 0 && (
          <p className="muted" style={{ fontSize: "0.8rem", padding: "8px 4px" }}>
            Say hi. Only you and your opponent can see this table chat.
          </p>
        )}
        {messages.map((m) => {
          const mine = me && m.address.toLowerCase() === me;
          return (
            <div
              key={m.id}
              className={`match-chat-bubble ${mine ? "mine" : "theirs"}`}
            >
              <div className="match-chat-meta">
                <strong>{mine ? "You" : m.name}</strong>
                <span>{formatTime(m.at)}</span>
              </div>
              <div className="match-chat-text">{m.text}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="alert" style={{ marginTop: 8, fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      <form className="match-chat-form" onSubmit={(e) => void onSend(e)}>
        <input
          className="input match-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          placeholder={
            !isPlayer
              ? "Players only"
              : !canChat
                ? "Chat closed"
                : "Message opponent…"
          }
          disabled={!isPlayer || !canChat || sending}
          maxLength={MAX_TEXT}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!isPlayer || !canChat || sending || !text.trim()}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </aside>
  );
}
