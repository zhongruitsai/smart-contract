"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContracts, useAccount, usePublicClient } from "wagmi";
import { parseUnits, parseAbiItem } from "viem";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID, DEPLOY_BLOCK } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI, GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

const KNOWN_NAMES: Record<string, string> = {
  "0x1d599054325fac1f349a46843f0788879779c530": "Account 1",
  "0x31fe085ce31ba1730353d68295aa93ff22504938": "Account 2",
  "0x697a1637b0fc7e23ba1a842b1d213de01c9e17c3": "Account 3",
  "0x7ccf00bd341acabdab1305423ca2d7eb5cc66f2b": "Account 4",
};

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function displayName(addr: string) {
  return KNOWN_NAMES[addr.toLowerCase()] ?? shortAddr(addr);
}

function ProxyVoteForm({ proposal, delegator }: { proposal: Proposal; delegator: string }) {
  const { writeContract, isPending } = useContractWrite();
  const [forV, setForV]         = useState("");
  const [againstV, setAgainstV] = useState("");
  const [abstainV, setAbstainV] = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "proxyHasVoted", args: [proposal.id, delegator as `0x${string}`], chainId: CHAIN_ID },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,  abi: GOVERNANCE_TOKEN_ABI,  functionName: "balanceOfAt",   args: [delegator as `0x${string}`, proposal.snapshotId], chainId: CHAIN_ID },
    ],
  });
  const alreadyVoted = data?.[0]?.result as boolean | undefined;
  const balance      = data?.[1]?.result as bigint | undefined;
  const shares       = balance ? Number(balance / BigInt(10 ** 18)) : null;
  const name         = displayName(delegator);

  async function voteOnBehalf(e: React.FormEvent) {
    e.preventDefault();
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
        abi: GOVERNANCE_VOTING_ABI,
        functionName: "voteOnBehalf",
        args: [proposal.id, delegator as `0x${string}`, parseUnits(forV || "0", 18), parseUnits(againstV || "0", 18), parseUnits(abstainV || "0", 18)],
      });
      toast.success(`已代 ${name} 完成投票`);
      refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (alreadyVoted) {
    return <p className="text-xs text-green-600">已代 {name} 完成投票。</p>;
  }

  return (
    <div className="space-y-1.5 border rounded p-2.5 bg-amber-50">
      <p className="text-xs font-medium text-amber-800">代理投票：{name}{shares !== null ? `（${shares} 股）` : ""}</p>
      <form onSubmit={voteOnBehalf} className="space-y-1.5">
        <div className="flex gap-2">
          <input type="number" min={0} placeholder="贊成" value={forV}     onChange={(e) => setForV(e.target.value)}     className="w-full px-2 py-1 border rounded text-sm" />
          <input type="number" min={0} placeholder="反對" value={againstV} onChange={(e) => setAgainstV(e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
          <input type="number" min={0} placeholder="棄權" value={abstainV} onChange={(e) => setAbstainV(e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
        </div>
        <button type="submit" disabled={isPending || (!forV && !againstV && !abstainV)} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm disabled:opacity-50 transition-colors">
          {isPending ? "送出中…" : `代 ${name} 投票`}
        </button>
      </form>
    </div>
  );
}

export function ProxyVotePanel({ proposal }: { proposal: Proposal }) {
  const { address }  = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [holders, setHolders] = useState<string[]>(Object.keys(KNOWN_NAMES));

  // Discover all token holders via Transfer events (chunked from block 0)
  const fetchHolders = useCallback(async () => {
    if (!publicClient) return;
    const CHUNK = BigInt(50000);
    const found: string[] = [];
    try {
      const latest = await publicClient.getBlockNumber();
      const startBlock = DEPLOY_BLOCK[CHAIN_ID] ?? BigInt(0);
      for (let from = startBlock; from <= latest; from += CHUNK) {
        const to = from + CHUNK - BigInt(1) < latest ? from + CHUNK - BigInt(1) : latest;
        const logs = await publicClient.getLogs({
          address:   CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
          event:     TRANSFER_EVENT,
          fromBlock: from,
          toBlock:   to,
        });
        logs
          .map((l) => (l.args.to as string).toLowerCase())
          .filter((a) => a !== "0x0000000000000000000000000000000000000000")
          .forEach((a) => found.push(a));
      }
    } catch {
      // fallback: keep current state
    }
    const merged = [...new Set([...Object.keys(KNOWN_NAMES), ...found])];
    setHolders(merged);
  }, [publicClient]);

  useEffect(() => {
    fetchHolders();
    const id = setInterval(fetchHolders, 5000);
    return () => clearInterval(id);
  }, [fetchHolders]);

  // For every holder (excluding self), check if they delegated to me
  const candidates = holders.filter(
    (a) => address && a.toLowerCase() !== address.toLowerCase()
  );

  const { data: proxyData } = useReadContracts({
    contracts: candidates.map((d) => ({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: "proxyOf" as const,
      args: [proposal.id, d as `0x${string}`],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 3000, enabled: candidates.length > 0 },
  });

  const activeDelegators = candidates.filter((_, i) => {
    const proxy = proxyData?.[i]?.result as string | undefined;
    return proxy && address && proxy.toLowerCase() === address.toLowerCase();
  });

  if (activeDelegators.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs font-semibold text-amber-700">收到委託 — 可代理投票：</p>
      {activeDelegators.map((d) => (
        <ProxyVoteForm key={d} proposal={proposal} delegator={d} />
      ))}
    </div>
  );
}
