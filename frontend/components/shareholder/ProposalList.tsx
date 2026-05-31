"use client";

import { useReadContract, useAccount } from "wagmi";
import { useEffect } from "react";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI, GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { PROPOSAL_TYPE_LABELS, VOTE_RESULT_LABELS, formatTimestamp, extractRevertReason } from "@/lib/utils";
import { VotePanel } from "./VotePanel";
import { ProxyPanel } from "./ProxyPanel";
import { ProxyVotePanel } from "./ProxyVotePanel";
import { CosignList } from "./CosignList";
import type { Proposal } from "@/types/governance";
import { formatUnits } from "viem";

const POLL_MS = 3000;

function useProposal(id: bigint) {
  return useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "proposals",
    args: [id],
    chainId: CHAIN_ID,
    query: { refetchInterval: POLL_MS },
  });
}

function ProposalCard({ id, isAdmin }: { id: bigint; isAdmin: boolean }) {
  const { writeContract, isPending } = useContractWrite();
  const { data, isLoading } = useProposal(id);
  const { data: contractTime } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "currentTime",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  if (isLoading || !data) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 text-sm text-muted-foreground animate-pulse">
        載入中…
      </div>
    );
  }

  const raw = data as readonly unknown[];
  const proposal: Proposal = {
    id:                    raw[0]  as bigint,
    proposer:              raw[1]  as `0x${string}`,
    description:           raw[2]  as string,
    pType:                 raw[3]  as number,
    snapshotId:            raw[4]  as bigint,
    voteEnd:               raw[5]  as bigint,
    meetingDate:           raw[6]  as bigint,
    totalSupplyAtSnapshot: raw[7]  as bigint,
    forVotes:              raw[8]  as bigint,
    againstVotes:          raw[9]  as bigint,
    abstainVotes:          raw[10] as bigint,
    isCosignProposal:      raw[11] as boolean,
    cosignDeadline:        raw[12] as bigint,
    cosignerCount:         raw[13] as bigint,
    isActive:              raw[14] as boolean,
    votingStarted:         raw[15] as boolean,
    finalized:             raw[16] as boolean,
    result:                raw[17] as number,
  };

  const blockTs = (contractTime as bigint | undefined) ?? BigInt(Math.floor(Date.now() / 1000));
  const votingOpen = proposal.votingStarted && !proposal.finalized && blockTs <= proposal.voteEnd;
  const canFinalize = proposal.votingStarted && !proposal.finalized && blockTs > proposal.voteEnd;

  async function finalize() {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "finalizeProposal", args: [proposal.id] });
      toast.success("結算交易已送出");
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  const statusLabel =
    proposal.finalized         ? VOTE_RESULT_LABELS[proposal.result] :
    canFinalize                ? "待結算" :
    votingOpen                 ? "投票中" :
    proposal.votingStarted     ? "投票已截止" :
    !proposal.isActive         ? `聯署中 ${Number(proposal.cosignerCount)}/10` :
    "等待開放投票";

  const statusColor =
    proposal.finalized && proposal.result === 1 ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" :
    proposal.finalized && proposal.result === 2 ? "bg-red-100 text-red-600 ring-1 ring-red-200" :
    canFinalize                                 ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200" :
    votingOpen                                  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200" :
    "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200";

  const supplyF = proposal.totalSupplyAtSnapshot > 0n ? formatUnits(proposal.totalSupplyAtSnapshot, 18) : "—";

  // Vote bar percentages based on snapshot supply
  const totalCast = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const base = proposal.totalSupplyAtSnapshot > 0n ? proposal.totalSupplyAtSnapshot : totalCast > 0n ? totalCast : 1n;
  const forPct    = Number((proposal.forVotes     * 10000n) / base) / 100;
  const againstPct = Number((proposal.againstVotes * 10000n) / base) / 100;
  const abstainPct = Number((proposal.abstainVotes * 10000n) / base) / 100;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              #{Number(proposal.id)}
            </span>
            <span className="text-xs px-2 py-0.5 bg-[#0f2456]/8 text-[#0f2456] rounded-full font-medium">
              {PROPOSAL_TYPE_LABELS[proposal.pType]}
            </span>
          </div>
          <p className="text-base font-semibold text-foreground break-words leading-snug">
            {proposal.description || "(無描述)"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            提案人：{proposal.proposer.slice(0,6)}…{proposal.proposer.slice(-4)}
          </p>
        </div>
        <span className={`text-xs font-semibold shrink-0 px-3 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Vote stats */}
      {proposal.votingStarted && (
        <div className="px-5 pb-3 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-center">
              <p className="text-emerald-600 font-medium">贊成</p>
              <p className="font-bold text-emerald-700 text-base mt-0.5">{Number(formatUnits(proposal.forVotes, 18)).toLocaleString()}</p>
              <p className="text-emerald-500 text-[10px] mt-0.5">{forPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-2.5 text-center">
              <p className="text-red-500 font-medium">反對</p>
              <p className="font-bold text-red-600 text-base mt-0.5">{Number(formatUnits(proposal.againstVotes, 18)).toLocaleString()}</p>
              <p className="text-red-400 text-[10px] mt-0.5">{againstPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5 text-center">
              <p className="text-gray-500 font-medium">棄權</p>
              <p className="font-bold text-gray-600 text-base mt-0.5">{Number(formatUnits(proposal.abstainVotes, 18)).toLocaleString()}</p>
              <p className="text-gray-400 text-[10px] mt-0.5">{abstainPct.toFixed(1)}%</p>
            </div>
          </div>

          {/* Vote bar */}
          {totalCast > 0n && (
            <div className="flex rounded-full overflow-hidden h-2 bg-gray-100">
              {forPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${forPct}%` }} />}
              {againstPct > 0 && <div className="bg-red-400 transition-all" style={{ width: `${againstPct}%` }} />}
              {abstainPct > 0 && <div className="bg-gray-300 transition-all" style={{ width: `${abstainPct}%` }} />}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            快照總股份：{Number(supplyF).toLocaleString()} ｜ 投票截止：{formatTimestamp(proposal.voteEnd)}
          </p>
        </div>
      )}

      {proposal.isCosignProposal && (
        <div className="px-5 pb-3">
          <CosignList proposal={proposal} />
        </div>
      )}

      {/* Action area */}
      {votingOpen && proposal.isActive && (
        <div className="px-5 py-3 border-t border-border bg-gray-50/60 space-y-3">
          <VotePanel proposal={proposal} />
          <ProxyPanel proposal={proposal} />
          <ProxyVotePanel proposal={proposal} />
        </div>
      )}

      {canFinalize && isAdmin && (
        <div className="px-5 py-3 border-t border-border">
          <button
            onClick={finalize}
            disabled={isPending}
            className="w-full py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#1a3570] transition-colors"
          >
            {isPending ? "處理中…" : "結算提案"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProposalList({ refreshSignal }: { refreshSignal?: number }) {
  const { address } = useAccount();

  const { data: owner } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
    abi: GOVERNANCE_TOKEN_ABI,
    functionName: "owner",
    chainId: CHAIN_ID,
  });
  const isAdmin = !!(address && owner && address.toLowerCase() === (owner as string).toLowerCase());

  const { data: nextId, refetch, isLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "nextProposalId",
    chainId: CHAIN_ID,
    query: { refetchInterval: POLL_MS },
  });

  useEffect(() => {
    if (refreshSignal) refetch();
  }, [refreshSignal]);

  const count = nextId ? Number(nextId) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[#0f2456]">
          {isLoading ? "讀取中…" : `提案列表（共 ${count} 件）`}
        </h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-3.36M20 15a9 9 0 01-14.13 3.36" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          重新整理
        </button>
      </div>
      {count === 0 && !isLoading && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          <p className="text-sm">目前沒有任何提案</p>
          <p className="text-xs mt-1">（若剛提交提案，請稍候 3 秒後自動更新）</p>
        </div>
      )}
      {Array.from({ length: count }, (_, i) => count - 1 - i).map((i) => (
        <ProposalCard key={i} id={BigInt(i)} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
