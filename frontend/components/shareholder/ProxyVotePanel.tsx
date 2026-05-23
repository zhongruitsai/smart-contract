"use client";

import { useState } from "react";
import { useReadContracts, useAccount } from "wagmi";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI, GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

const KNOWN_SHAREHOLDERS = [
  { name: "Account 1", address: "0x1d599054325fac1f349a46843f0788879779c530" },
  { name: "Account 2", address: "0x31fE085cE31BA1730353D68295Aa93FF22504938" },
  { name: "Account 3", address: "0x697a1637b0fC7e23ba1a842B1D213DE01C9E17c3" },
  { name: "Account 4", address: "0x7cCf00BD341aCABdab1305423CA2d7eb5cc66F2B" },
] as const;

function ProxyVoteForm({ proposal, delegator, delegatorName }: { proposal: Proposal; delegator: string; delegatorName: string }) {
  const { writeContract, isPending } = useContractWrite();
  const [forV, setForV]       = useState("");
  const [againstV, setAgainstV] = useState("");
  const [abstainV, setAbstainV] = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "proxyHasVoted", args: [proposal.id, delegator as `0x${string}`], chainId: CHAIN_ID },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN, abi: GOVERNANCE_TOKEN_ABI, functionName: "balanceOfAt", args: [delegator as `0x${string}`, proposal.snapshotId], chainId: CHAIN_ID },
    ],
  });
  const alreadyVoted = data?.[0]?.result as boolean | undefined;
  const balance = data?.[1]?.result as bigint | undefined;
  const shares = balance ? Number(balance / BigInt(10 ** 18)) : null;

  async function voteOnBehalf(e: React.FormEvent) {
    e.preventDefault();
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
        abi: GOVERNANCE_VOTING_ABI,
        functionName: "voteOnBehalf",
        args: [proposal.id, delegator as `0x${string}`, parseUnits(forV || "0", 18), parseUnits(againstV || "0", 18), parseUnits(abstainV || "0", 18)],
      });
      toast.success(`已代 ${delegatorName} 完成投票`);
      refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (alreadyVoted) {
    return <p className="text-xs text-green-600">已代 {delegatorName} 完成投票。</p>;
  }

  return (
    <div className="space-y-1.5 border rounded p-2.5 bg-amber-50">
      <p className="text-xs font-medium text-amber-800">代理投票：{delegatorName}{shares !== null ? `（${shares} 股）` : ""}</p>
      <form onSubmit={voteOnBehalf} className="space-y-1.5">
        <div className="flex gap-2">
          <input type="number" min={0} placeholder="贊成" value={forV}     onChange={(e) => setForV(e.target.value)}     className="w-full px-2 py-1 border rounded text-sm" />
          <input type="number" min={0} placeholder="反對" value={againstV} onChange={(e) => setAgainstV(e.target.value) } className="w-full px-2 py-1 border rounded text-sm" />
          <input type="number" min={0} placeholder="棄權" value={abstainV} onChange={(e) => setAbstainV(e.target.value) } className="w-full px-2 py-1 border rounded text-sm" />
        </div>
        <button type="submit" disabled={isPending} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm disabled:opacity-50 transition-colors">
          {isPending ? "送出中…" : `代 ${delegatorName} 投票`}
        </button>
      </form>
    </div>
  );
}

export function ProxyVotePanel({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();

  const { data } = useReadContracts({
    contracts: KNOWN_SHAREHOLDERS.map((s) => ({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: "proxyOf",
      args: [proposal.id, s.address as `0x${string}`],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 3000 },
  });

  const delegators = KNOWN_SHAREHOLDERS.filter((s, i) => {
    const proxy = data?.[i]?.result as string | undefined;
    return (
      proxy &&
      address &&
      proxy.toLowerCase() === address.toLowerCase() &&
      s.address.toLowerCase() !== address.toLowerCase()
    );
  });

  if (delegators.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs font-semibold text-amber-700">收到委託 — 可代理投票：</p>
      {delegators.map((d) => (
        <ProxyVoteForm key={d.address} proposal={proposal} delegator={d.address} delegatorName={d.name} />
      ))}
    </div>
  );
}
