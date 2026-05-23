"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

export function VotePanel({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useContractWrite();
  const [forV, setForV] = useState("");
  const [againstV, setAgainstV] = useState("");
  const [abstainV, setAbstainV] = useState("");

  const { data: voted, refetch: refetchVoted } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "hasVoted",
    args: [proposal.id, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: CHAIN_ID,
  });

  async function vote(e: React.FormEvent) {
    e.preventDefault();
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
        abi: GOVERNANCE_VOTING_ABI,
        functionName: "vote",
        args: [parseUnits(forV || "0", 18), parseUnits(againstV || "0", 18), parseUnits(abstainV || "0", 18), proposal.id],
      });
      toast.success("投票已成功上鏈");
      refetchVoted();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (voted) return <p className="text-sm text-green-600">您已完成投票。</p>;

  return (
    <form onSubmit={vote} className="space-y-2">
      <p className="text-xs text-muted-foreground">輸入票數（單位：股份代幣）：</p>
      <div className="flex gap-2">
        <input type="number" placeholder="贊成" value={forV} onChange={(e) => setForV(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
        <input type="number" placeholder="反對" value={againstV} onChange={(e) => setAgainstV(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
        <input type="number" placeholder="棄權" value={abstainV} onChange={(e) => setAbstainV(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">
        {isPending ? "送出中…" : "投票"}
      </button>
    </form>
  );
}
