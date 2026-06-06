"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { toast } from "sonner";
import { parseUnits, formatUnits } from "viem";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { DIRECTOR_ELECTION_ABI } from "@/lib/abis";
import { extractRevertReason, formatTimestamp } from "@/lib/utils";
import type { Election } from "@/types/governance";

function ElectionCard({ id }: { id: bigint }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useContractWrite();
  const [voteInputs, setVoteInputs] = useState<Record<string, string>>({});

  const { data: electionRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getElection",
    args: [id],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const { data: candidatesRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getCandidates",
    args: [id],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const { data: hasVoted } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "hasVoted",
    args: [id, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const { data: contractTime } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "currentTime",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const candidates = (candidatesRaw ?? []) as `0x${string}`[];

  const { data: votesData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "getCandidateVotes" as const,
      args: [id, c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 3000, enabled: candidates.length > 0 },
  });

  const { data: namesData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "candidateName" as const,
      args: [c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 5000, enabled: candidates.length > 0 },
  });

  const { data: photosData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "candidatePhotoUrl" as const,
      args: [c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 5000, enabled: candidates.length > 0 },
  });

  if (!electionRaw) return null;

  const raw = electionRaw as readonly unknown[];
  const election: Election = {
    id:             raw[0] as bigint,
    meetingDate:    raw[1] as bigint,
    seatCount:      raw[2] as bigint,
    voteEnd:        raw[3] as bigint,
    snapshotId:     raw[4] as bigint,
    finalized:      raw[5] as boolean,
    candidateCount: raw[6] as bigint,
  };

  const now = (contractTime as bigint | undefined) ?? BigInt(Math.floor(Date.now() / 1000));
  const votingOpen = now <= election.voteEnd && !election.finalized;
  const totalVotes = (votesData ?? []).reduce((s, v) => s + ((v?.result as bigint) ?? 0n), 0n);

  const electedSet = useMemo(() => {
    if (!election.finalized || candidates.length === 0) return new Set<string>();
    const sorted = candidates
      .map((addr, i) => ({ addr, votes: (votesData?.[i]?.result as bigint) ?? 0n }))
      .sort((a, b) => (b.votes > a.votes ? 1 : b.votes < a.votes ? -1 : 0));
    return new Set(sorted.slice(0, Number(election.seatCount)).map(x => x.addr));
  }, [election.finalized, election.seatCount, candidates, votesData]);

  async function castVotes(e: React.FormEvent) {
    e.preventDefault();
    const addrs = candidates.filter(c => voteInputs[c] && Number(voteInputs[c]) > 0);
    const votes = addrs.map(c => parseUnits(voteInputs[c], 18));
    if (addrs.length === 0) { toast.error("請至少為一位候選人填入票數"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "castVotes",
        args: [id, addrs, votes],
      });
      toast.success("投票已成功上鏈");
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  const statusLabel = election.finalized ? "已結算" : votingOpen ? "投票中" : "投票截止";
  const statusColor = election.finalized
    ? "bg-emerald-100 text-emerald-700"
    : votingOpen
    ? "bg-blue-100 text-blue-700"
    : "bg-gray-100 text-gray-500";

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0f2456]">選舉 #{Number(id)}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusColor}`}>{statusLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {Number(election.seatCount)} 席次 ‧ 截止：{formatTimestamp(election.voteEnd)}
          </p>
        </div>
        {totalVotes > 0n && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">總投票數</p>
            <p className="text-sm font-bold text-[#0f2456]">{Number(formatUnits(totalVotes, 18)).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Elected result banner */}
      {election.finalized && electedSet.size > 0 && (
        <div className="px-5 py-3 bg-yellow-50 border-b border-yellow-200 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-yellow-800">本屆當選董事</span>
          {candidates
            .filter(addr => electedSet.has(addr))
            .map((addr) => {
              const name = (namesData?.[candidates.indexOf(addr)]?.result as string) || addr.slice(0,6) + "…" + addr.slice(-4);
              const photoUrl = (photosData?.[candidates.indexOf(addr)]?.result as string) || "";
              return (
                <div key={addr} className="flex items-center gap-1.5">
                  {photoUrl
                    ? <img src={photoUrl} alt={name} className="w-6 h-6 rounded-full object-cover border border-yellow-400" />
                    : <div className="w-6 h-6 rounded-full bg-yellow-300 flex items-center justify-center text-xs font-bold text-yellow-900">{name[0]}</div>
                  }
                  <span className="text-sm font-semibold text-yellow-900">{name}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Candidates */}
      <div className="px-5 py-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無候選人。</p>
        ) : (
          <form onSubmit={castVotes} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {candidates.map((addr, i) => {
                const name     = (namesData?.[i]?.result as string) || "候選人";
                const photoUrl = (photosData?.[i]?.result as string) || "";
                const votes    = (votesData?.[i]?.result as bigint) ?? 0n;
                const maxV = totalVotes > 0n ? totalVotes : 1n;
                const pct = Number((votes * 100n) / maxV);
                const isElected = electedSet.has(addr);

                return (
                  <div key={addr} className={`relative flex flex-col items-center gap-2 p-3 border rounded-xl text-center transition-all ${
                    isElected
                      ? "border-yellow-400 bg-yellow-50 shadow-md"
                      : "border-border bg-gray-50"
                  }`}>
                    {isElected && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                        當選董事
                      </span>
                    )}
                    {photoUrl ? (
                      <img src={photoUrl} alt={name} className={`w-16 h-16 rounded-full object-cover shadow ${isElected ? "border-2 border-yellow-400" : "border-2 border-white"}`} />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-200 to-indigo-300 flex items-center justify-center text-2xl font-bold text-white shadow">
                        {name[0] ?? "?"}
                      </div>
                    )}
                    <div className="w-full">
                      <p className="text-sm font-semibold leading-tight">{name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{addr.slice(0,6)}…{addr.slice(-4)}</p>
                      {totalVotes > 0n && (
                        <div className="mt-1.5">
                          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${isElected ? "bg-yellow-500" : "bg-[#0f2456]"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {Number(formatUnits(votes, 18)).toLocaleString()} 票（{pct}%）
                          </p>
                        </div>
                      )}
                    </div>
                    {votingOpen && !hasVoted && (
                      <input
                        type="number"
                        placeholder="分配票數"
                        min="0"
                        value={voteInputs[addr] ?? ""}
                        onChange={e => setVoteInputs(prev => ({ ...prev, [addr]: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {votingOpen && !hasVoted && (
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={isPending}
                  className="px-5 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#1a3570] transition-colors">
                  {isPending ? "送出中…" : "確認投票"}
                </button>
                <p className="text-xs text-muted-foreground">
                  可用票數 = 你的股份 × {Number(election.seatCount)} 席次，可自由分配
                </p>
              </div>
            )}
            {hasVoted && (
              <p className="text-sm text-emerald-600 font-medium">您已完成本次選舉投票。</p>
            )}
          </form>
        )}

      </div>
    </div>
  );
}

export function ElectionPanel() {
  const { data: nextId } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "nextElectionId",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const count = nextId ? Number(nextId) : 0;

  return (
    <div className="space-y-4">
      {count === 0 && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          <p className="text-sm">目前沒有進行中的董事選舉</p>
        </div>
      )}
      {Array.from({ length: count }, (_, i) => (
        <ElectionCard key={i} id={BigInt(i)} />
      ))}
    </div>
  );
}
