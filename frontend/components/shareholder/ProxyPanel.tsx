"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, formatAddress } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

export function ProxyPanel({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useContractWrite();
  const [proxyAddr, setProxyAddr] = useState("");

  const { data: currentProxy } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "proxyOf",
    args: [proposal.id, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: CHAIN_ID,
  });

  async function grantProxy(e: React.FormEvent) {
    e.preventDefault();
    if (!proxyAddr.startsWith("0x")) { toast.error("地址格式錯誤"); return; }
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "grantProxy", args: [proposal.id, proxyAddr as `0x${string}`] });
      toast.success("委託已成功上鏈");
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  async function revokeProxy() {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "revokeProxy", args: [proposal.id] });
      toast.success("委託已撤回");
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  const hasProxy = currentProxy && currentProxy !== "0x0000000000000000000000000000000000000000";

  if (hasProxy) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">已委託：<span className="font-mono">{formatAddress(currentProxy as string)}</span></p>
        <button onClick={revokeProxy} disabled={isPending} className="px-3 py-1.5 border border-destructive text-destructive rounded text-sm disabled:opacity-50">
          {isPending ? "…" : "撤回委託"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={grantProxy} className="flex gap-2">
      <input type="text" placeholder="委託人地址 0x…" value={proxyAddr} onChange={(e) => setProxyAddr(e.target.value)} className="flex-1 px-2 py-1.5 border rounded text-sm" />
      <button type="submit" disabled={isPending || !proxyAddr} className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50">
        {isPending ? "…" : "委託投票"}
      </button>
    </form>
  );
}
