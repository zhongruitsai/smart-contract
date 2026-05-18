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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-3xl font-bold">公司治理系統</h1>
        <p className="text-muted-foreground">請先連接錢包以繼續操作。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">股東會管理平台</h1>
          <p className="text-sm text-muted-foreground">
            已連接：{formatAddress(address!)}
            {isOwner && <span className="ml-2 text-blue-600 font-semibold">（管理員）</span>}
          </p>
        </div>
      </div>

      {isOwner && <TimeController />}

      {isOwner && <AdminDashboard />}
      <ShareholderPortal />
    </div>
  );
}
