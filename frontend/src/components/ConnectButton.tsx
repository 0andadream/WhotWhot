"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { useEffect, useState } from "react";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return (
      <div className="row">
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
          onClick={() => disconnect()}
        >
          {short}
        </button>
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
      // Deep-link into MetaMask in-app browser
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
      setTimeout(() => setOpen(true), 900);
      return;
    }
    if (primary) {
      connect({ connector: primary });
    } else {
      setOpen(true);
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
      {open && (
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
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
      {error && (
        <div className="alert" style={{ position: "absolute", right: 0, top: "110%", width: 220, zIndex: 40 }}>
          {error.message.slice(0, 120)}
        </div>
      )}
    </div>
  );
}
