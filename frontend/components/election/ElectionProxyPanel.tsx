"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract, useReadContracts, useAccount, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, parseAbiItem } from "viem";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID, DEPLOY_BLOCK } from "@/lib/config";
import { DIRECTOR_ELECTION_ABI, GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { extractRevertReason, formatAddress } from "@/lib/utils";
import { getProfile } from "@/lib/candidateProfiles";
import type { Election } from "@/types/governance";

const KNOWN_NAMES: Record<string, string> = {
  "0x1d599054325fac1f349a46843f0788879779c530": "Account 1",
  "0x31fe085ce31ba1730353d68295aa93ff22504938": "Account 2",
  "0x697a1637b0fc7e23ba1a842b1d213de01c9e17c3": "Account 3",
  "0x7ccf00bd341acabdab1305423ca2d7eb5cc66f2b": "Account 4",
};

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const PROXY_GRANTED_EVENT = parseAbiItem(
  "event ProxyGranted(uint256 indexed electionId, address indexed delegator, address indexed proxy)"
);

// ─── Delegator grant proxy panel (shown to each shareholder) ─────────────────

export function ElectionProxyPanel({ election }: { election: Election }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useContractWrite();
  const [proxyAddr, setProxyAddr] = useState("");

  const { data: currentProxy, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "proxyOf",
    args: [election.id, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  async function grantProxy(e: React.FormEvent) {
    e.preventDefault();
    if (!proxyAddr.startsWith("0x")) { toast.error("地址格式錯誤"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "grantProxy",
        args: [election.id, proxyAddr as `0x${string}`],
      });
      toast.success("委託已成功上鏈");
      refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  const hasProxy = currentProxy && currentProxy !== "0x0000000000000000000000000000000000000000";

  if (hasProxy) {
    return (
      <p className="text-xs text-muted-foreground">
        已委託：<span className="font-mono">{formatAddress(currentProxy as string)}</span>
      </p>
    );
  }

  return (
    <form onSubmit={grantProxy} className="flex gap-2">
      <input type="text" placeholder="委託人地址 0x…" value={proxyAddr}
        onChange={(e) => setProxyAddr(e.target.value)}
        className="flex-1 px-2 py-1.5 border rounded text-sm" />
      <button type="submit" disabled={isPending || !proxyAddr}
        className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50">
        {isPending ? "…" : "委託投票"}
      </button>
    </form>
  );
}

// ─── Proxy vote form for one delegator ───────────────────────────────────────

function ProxyVoteForm({ election, delegator, candidates }: {
  election: Election;
  delegator: string;
  candidates: `0x${string}`[];
}) {
  const { writeContract, isPending } = useContractWrite();
  const [voteInputs, setVoteInputs] = useState<Record<string, string>>({});

  const { data: statusData, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "proxyHasVoted" as const,
        args: [election.id, delegator as `0x${string}`],
        chainId: CHAIN_ID,
      },
      {
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "balanceOfAt" as const,
        args: [delegator as `0x${string}`, election.snapshotId],
        chainId: CHAIN_ID,
      },
    ],
    query: { refetchInterval: 3000 },
  });

  const alreadyVoted = statusData?.[0]?.result as boolean | undefined;
  const balance      = statusData?.[1]?.result as bigint | undefined;
  const shares       = balance ? Number(formatUnits(balance, 18)).toLocaleString() : null;
  const name         = KNOWN_NAMES[delegator.toLowerCase()] ?? `${delegator.slice(0,6)}…${delegator.slice(-4)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addrs = candidates.filter(c => voteInputs[c] && Number(voteInputs[c]) > 0);
    const votes = addrs.map(c => parseUnits(voteInputs[c], 18));
    if (addrs.length === 0) { toast.error("請至少填入一位候選人的票數"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "voteOnBehalf",
        args: [election.id, delegator as `0x${string}`, addrs, votes],
      });
      toast.success(`已代 ${name} 完成投票`);
      refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (alreadyVoted) {
    return <p className="text-xs text-green-600">已代 {name} 完成投票。</p>;
  }

  return (
    <div className="space-y-2 border rounded-xl p-3 bg-amber-50">
      <p className="text-xs font-medium text-amber-800">
        代理投票：{name}{shares !== null ? `（${shares} 股）` : ""}
      </p>
      <form onSubmit={submit} className="space-y-2">
        {candidates.map(c => {
          const cName = (getProfile(c).name) || `${c.slice(0,6)}…${c.slice(-4)}`;
          return (
            <div key={c} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">{cName}</span>
              <input type="number" min={0} placeholder="票數"
                value={voteInputs[c] ?? ""}
                onChange={e => setVoteInputs(prev => ({ ...prev, [c]: e.target.value }))}
                className="w-24 px-2 py-1 border rounded text-sm text-center" />
            </div>
          );
        })}
        <button type="submit" disabled={isPending}
          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm disabled:opacity-50 transition-colors">
          {isPending ? "送出中…" : `代 ${name} 投票`}
        </button>
      </form>
    </div>
  );
}

// ─── Panel shown to proxy: list all delegators ───────────────────────────────

export function ElectionProxyVotePanel({ election, candidates }: {
  election: Election;
  candidates: `0x${string}`[];
}) {
  const { address }  = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [holders, setHolders] = useState<string[]>(Object.keys(KNOWN_NAMES));

  const fetchHolders = useCallback(async () => {
    if (!publicClient) return;
    const CHUNK = BigInt(50000);
    const found: string[] = [];
    try {
      const latest = await publicClient.getBlockNumber();
      const startBlock = DEPLOY_BLOCK[CHAIN_ID] ?? BigInt(0);
      for (let from = startBlock; from <= latest; from += CHUNK) {
        const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
          event: TRANSFER_EVENT,
          fromBlock: from, toBlock: to,
        });
        logs.map(l => (l.args.to as string).toLowerCase())
            .filter(a => a !== "0x0000000000000000000000000000000000000000")
            .forEach(a => found.push(a));
      }
    } catch {}
    setHolders([...new Set([...Object.keys(KNOWN_NAMES), ...found])]);
  }, [publicClient]);

  useEffect(() => {
    fetchHolders();
    const id = setInterval(fetchHolders, 5000);
    return () => clearInterval(id);
  }, [fetchHolders]);

  const candidatesForMe = holders.filter(a => address && a !== address.toLowerCase());

  const { data: proxyData } = useReadContracts({
    contracts: candidatesForMe.map(d => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "proxyOf" as const,
      args: [election.id, d as `0x${string}`],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 3000, enabled: candidatesForMe.length > 0 },
  });

  const activeDelegators = candidatesForMe.filter((_, i) => {
    const proxy = proxyData?.[i]?.result as string | undefined;
    return proxy && address && proxy.toLowerCase() === address.toLowerCase();
  });

  if (activeDelegators.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs font-semibold text-amber-700">收到委託 — 可代理投票：</p>
      {activeDelegators.map(d => (
        <ProxyVoteForm key={d} election={election} delegator={d} candidates={candidates} />
      ))}
    </div>
  );
}
