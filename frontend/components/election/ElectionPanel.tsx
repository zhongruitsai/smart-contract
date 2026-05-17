"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBlock } from "wagmi";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { DIRECTOR_ELECTION_ABI } from "@/lib/abis";
import { extractRevertReason, formatTimestamp, formatAddress } from "@/lib/utils";
import type { Election } from "@/types/governance";

function ElectionCard({ id }: { id: bigint }) {
  const { address } = useAccount();
  const [voteInputs, setVoteInputs] = useState<Record<string, string>>({});

  const { data: electionRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getElection",
    args: [id],
    query: { refetchInterval: 3000 },
  });

  const { data: candidates } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getCandidates",
    args: [id],
    query: { refetchInterval: 3000 },
  });

  const { data: hasVoted } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "hasVoted",
    args: [id, address ?? "0x0"],
    query: { refetchInterval: 3000 },
  });

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash });
  const { data: block } = useBlock({ watch: true, query: { refetchInterval: 3000 } });
  const busy = isPending || isConfirming;

  useEffect(() => { if (writeError) toast.error(extractRevertReason(writeError)); }, [writeError]);
  useEffect(() => { if (receiptError) toast.error(extractRevertReason(receiptError)); }, [receiptError]);
  useEffect(() => { if (isSuccess) toast.success("投票已成功上鏈"); }, [isSuccess]);

  if (!electionRaw) return null;

  const raw = electionRaw as readonly unknown[];
  const election: Election = {
    id: raw[0] as bigint,
    meetingDate: raw[1] as bigint,
    seatCount: raw[2] as bigint,
    voteEnd: raw[3] as bigint,
    snapshotId: raw[4] as bigint,
    finalized: raw[5] as boolean,
    candidateCount: raw[6] as bigint,
  };

  const candidateList = (candidates ?? []) as `0x${string}`[];
  const blockTs = block?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const votingOpen = blockTs <= election.voteEnd && !election.finalized;

  function castVotes(e: React.FormEvent) {
    e.preventDefault();
    const addrs = candidateList.filter((c) => voteInputs[c] && Number(voteInputs[c]) > 0);
    const votes = addrs.map((c) => parseUnits(voteInputs[c], 18));
    if (addrs.length === 0) { toast.error("請至少為一位候選人填入票數"); return; }
    writeContract({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "castVotes",
      args: [id, addrs, votes],
    });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">選舉 #{Number(id)}</p>
          <p className="text-xs text-muted-foreground">
            {Number(election.seatCount)} 席次 · 截止：{formatTimestamp(election.voteEnd)}
          </p>
        </div>
        {election.finalized && <span className="text-xs font-semibold text-green-600">已結算</span>}
      </div>

      {candidateList.length === 0 && (
        <p className="text-xs text-muted-foreground">尚無候選人。</p>
      )}

      {candidateList.length > 0 && votingOpen && !hasVoted && (
        <form onSubmit={castVotes} className="space-y-2">
          <p className="text-xs text-muted-foreground">分配票數（單位：股份代幣）：</p>
          {candidateList.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <span className="text-xs font-mono flex-1">{formatAddress(c)}</span>
              <input
                type="number"
                placeholder="0"
                min="0"
                value={voteInputs[c] ?? ""}
                onChange={(e) => setVoteInputs((prev) => ({ ...prev, [c]: e.target.value }))}
                className="w-28 px-2 py-1 border rounded text-sm"
              />
            </div>
          ))}
          <button type="submit" disabled={busy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">
            {busy ? "送出中…" : "投票"}
          </button>
        </form>
      )}

      {hasVoted && <p className="text-sm text-green-600">您已完成本次選舉投票。</p>}
    </div>
  );
}

export function ElectionPanel() {
  const { data: nextId } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "nextElectionId",
    query: { refetchInterval: 3000 },
  });

  const count = nextId ? Number(nextId) : 0;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">董事選舉</h3>
      {count === 0 && <p className="text-sm text-muted-foreground">目前沒有進行中的選舉。</p>}
      {Array.from({ length: count }, (_, i) => (
        <ElectionCard key={i} id={BigInt(i)} />
      ))}
    </div>
  );
}
