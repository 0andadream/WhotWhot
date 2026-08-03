"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return (
      <div className="row">
        {chainId !== base.id && (
          <button
            type="button"
            className="btn btn-gold connect-btn"
            onClick={() => switchChain({ chainId: base.id })}
          >
            Switch to Base
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost connect-btn"
          onClick={() => disconnect()}
        >
          {short}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary connect-btn"
      disabled={isPending}
      onClick={() => connect({ connector: connectors[0] })}
    >
      {isPending ? "…" : "Connect"}
    </button>
  );
}
