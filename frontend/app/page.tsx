"use client";

import { useAccount, useReadContract } from "wagmi";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ShareholderPortal } from "@/components/shareholder/ShareholderPortal";
import { TimeController } from "@/components/TimeController";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { formatAddress } from "@/lib/utils";

export default function Home() {
  const { address, isConnected } = useAccount();

  const { data: owner } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
    abi: GOVERNANCE_TOKEN_ABI,
    functionName: "owner",
    chainId: CHAIN_ID,
  });

  const isOwner = isConnected && address && owner &&
    address.toLowerCase() === (owner as string).toLowerCase();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[#0f2456] flex items-center justify-center shadow-xl">
          <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-white" stroke="currentColor" strokeWidth={1.5}>
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
            <circle cx="20" cy="6" r="2" fill="currentColor" stroke="none"/>
            <circle cx="20" cy="12" r="2" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-[#0f2456]">公司治理系統</h1>
          <p className="text-muted-foreground text-lg">基於區塊鏈的股東會議投票與提案平台</p>
        </div>
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <p>請透過 MetaMask 連接錢包以繼續操作</p>
          <div className="flex gap-6 mt-2">
            {["提案管理", "投票表決", "委託投票"].map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-[#0f2456]/70 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0f2456]/50" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold text-[#0f2456]">股東會管理平台</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            已連接：<span className="font-mono">{formatAddress(address!)}</span>
            {isOwner && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                管理員
              </span>
            )}
          </p>
        </div>
      </div>

      {isOwner && <TimeController />}
      {isOwner && <AdminDashboard />}
      <ShareholderPortal />
    </div>
  );
}
