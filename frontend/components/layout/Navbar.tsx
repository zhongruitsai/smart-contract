"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { formatAddress } from "@/lib/utils";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <span className="font-bold text-lg">公司治理系統</span>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <span className="text-sm text-muted-foreground font-mono">
                {formatAddress(address!)}
              </span>
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                中斷連線
              </button>
            </>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              連接錢包
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
