"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { toast } from "sonner";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, formatAddress } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

export function ProxyPanel({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();
  const [proxyAddr, setProxyAddr] = useState("");

  const { data: currentProxy } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "proxyOf",
    args: [proposal.id, address ?? "0x0"],
  });

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || isConfirming;

  useEffect(() => {
    if (writeError) toast.error(extractRevertReason(writeError));
  }, [writeError]);

  useEffect(() => {
    if (receiptError) toast.error(extractRevertReason(receiptError));
  }, [receiptError]);

  useEffect(() => {
    if (isSuccess) toast.success("操作成功上鏈");
  }, [isSuccess]);

  function grantProxy(e: React.FormEvent) {
    e.preventDefault();
    if (!proxyAddr.startsWith("0x")) { toast.error("地址格式錯誤"); return; }
    writeContract({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: "grantProxy",
      args: [proposal.id, proxyAddr as `0x${string}`],
    });
  }

  function revokeProxy() {
    writeContract({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: "revokeProxy",
      args: [proposal.id],
    });
  }

  const hasProxy = currentProxy && currentProxy !== "0x0000000000000000000000000000000000000000";

  if (hasProxy) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          已委託：<span className="font-mono">{formatAddress(currentProxy as string)}</span>
        </p>
        <button
          onClick={revokeProxy}
          disabled={busy}
          className="px-3 py-1.5 border border-destructive text-destructive rounded text-sm disabled:opacity-50"
        >
          撤回委託
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={grantProxy} className="flex gap-2">
      <input
        type="text"
        placeholder="委託人地址 0x…"
        value={proxyAddr}
        onChange={(e) => setProxyAddr(e.target.value)}
        className="flex-1 px-2 py-1.5 border rounded text-sm"
      />
      <button
        type="submit"
        disabled={busy || !proxyAddr}
        className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50"
      >
        {busy ? "…" : "委託投票"}
      </button>
    </form>
  );
}
