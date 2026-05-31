"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { formatAddress } from "@/lib/utils";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <nav className="bg-[#0f2456] shadow-lg">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
              <circle cx="20" cy="6" r="2" fill="currentColor" stroke="none"/>
              <circle cx="20" cy="12" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <span className="font-bold text-white text-lg tracking-wide">公司治理系統</span>
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span className="text-sm text-white/90 font-mono">{formatAddress(address!)}</span>
              </div>
              <button
                onClick={() => disconnect()}
                className="px-4 py-1.5 text-sm rounded-full border border-white/30 text-white/80 hover:bg-white/10 transition-colors"
              >
                中斷連線
              </button>
            </>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="px-5 py-2 text-sm rounded-full bg-white text-[#0f2456] font-semibold hover:bg-white/90 transition-colors shadow"
            >
              連接錢包
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
