"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { useEffect, useRef, useState } from "react";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  // Close account menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = address;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return (
      <div className="row" style={{ position: "relative" }} ref={menuRef}>
        {chainId !== base.id && (
          <button
            type="button"
            className="btn btn-primary btn-sm connect-btn"
            onClick={() => switchChain({ chainId: base.id })}
          >
            Switch to Base
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm connect-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {short}
        </button>

        {menuOpen && (
          <div
            className="card-panel wallet-menu"
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              zIndex: 50,
              width: 280,
              padding: 14,
            }}
          >
            <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 6 }}>
              Connected
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.78rem",
                wordBreak: "break-all",
                lineHeight: 1.4,
                color: "var(--text-on-dark)",
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,209,102,0.15)",
              }}
            >
              {address}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: "100%" }}
                onClick={copyAddress}
              >
                {copied ? "Copied" : "Copy address"}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ width: "100%" }}
                onClick={() => {
                  setMenuOpen(false);
                  disconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const injected = connectors.filter((c) => c.type === "injected");
  const primary = injected[0] || connectors[0];

  const hasInjected =
    typeof window !== "undefined" &&
    typeof (window as Window & { ethereum?: unknown }).ethereum !== "undefined";

  const onConnect = () => {
    if (mobile && !hasInjected) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
      setTimeout(() => setHelpOpen(true), 900);
      return;
    }
    if (primary) {
      connect({ connector: primary });
    } else {
      setHelpOpen(true);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-primary btn-sm connect-btn"
        disabled={isPending}
        onClick={onConnect}
      >
        {isPending ? "…" : mobile && !hasInjected ? "Open wallet" : "Connect"}
      </button>
      {helpOpen && (
        <div
          className="card-panel"
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            zIndex: 40,
            width: 260,
            padding: 12,
          }}
        >
          <p className="muted" style={{ marginBottom: 8 }}>
            {mobile
              ? "Install MetaMask or Coinbase Wallet, then open this site inside the wallet browser."
              : "Install a browser wallet (MetaMask, Rabby, Coinbase) and refresh."}
          </p>
          <a
            className="btn btn-secondary btn-sm"
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
          >
            Get MetaMask
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => setHelpOpen(false)}
          >
            Close
          </button>
        </div>
      )}
      {error && (
        <div
          className="alert"
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            width: 220,
            zIndex: 40,
          }}
        >
          {error.message.slice(0, 120)}
        </div>
      )}
    </div>
  );
}
