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
    return <div className="border rounded-lg p-4 text-sm text-muted-foreground">載入中…</div>;
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
    proposal.finalized && proposal.result === 1 ? "bg-green-100 text-green-700" :
    proposal.finalized && proposal.result === 2 ? "bg-red-100 text-red-600" :
    canFinalize                                 ? "bg-orange-100 text-orange-700" :
    votingOpen                                  ? "bg-blue-100 text-blue-700" :
    "bg-yellow-100 text-yellow-700";

  const supplyF = proposal.totalSupplyAtSnapshot > BigInt(0) ? formatUnits(proposal.totalSupplyAtSnapshot, 18) : "—";

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">#{Number(proposal.id)}</span>
            <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{PROPOSAL_TYPE_LABELS[proposal.pType]}</span>
          </div>
          <p className="text-sm mt-1 break-words">{proposal.description || "(無描述)"}</p>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">提案人：{proposal.proposer.slice(0,6)}…{proposal.proposer.slice(-4)}</p>
        </div>
        <span className={`text-xs font-semibold shrink-0 px-2 py-1 rounded ${statusColor}`}>{statusLabel}</span>
      </div>
      {proposal.votingStarted && (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 rounded p-2 text-center"><p className="text-muted-foreground">贊成</p><p className="font-semibold text-green-700">{formatUnits(proposal.forVotes, 18)}</p></div>
            <div className="bg-red-50 rounded p-2 text-center"><p className="text-muted-foreground">反對</p><p className="font-semibold text-red-600">{formatUnits(proposal.againstVotes, 18)}</p></div>
            <div className="bg-gray-50 rounded p-2 text-center"><p className="text-muted-foreground">棄權</p><p className="font-semibold">{formatUnits(proposal.abstainVotes, 18)}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">快照總股份：{supplyF} ｜ 投票截止：{formatTimestamp(proposal.voteEnd)}</p>
        </>
      )}
      {proposal.isCosignProposal && <CosignList proposal={proposal} />}
      {votingOpen && proposal.isActive && (
        <div className="space-y-2 border-t pt-2">
          <VotePanel proposal={proposal} />
          <ProxyPanel proposal={proposal} />
          <ProxyVotePanel proposal={proposal} />
        </div>
      )}
      {canFinalize && isAdmin && (
        <button onClick={finalize} disabled={isPending} className="w-full py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50">
          {isPending ? "處理中…" : "結算提案"}
        </button>
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
        <h3 className="font-semibold text-sm text-muted-foreground">
          {isLoading ? "讀取中…" : `提案列表（共 ${count} 件）`}
        </h3>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">↺ 重新整理</button>
      </div>
      {count === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          目前沒有任何提案。<br/>
          <span className="text-xs">（若剛提交提案，請稍候 3 秒後自動更新，或點「重新整理」）</span>
        </p>
      )}
      {Array.from({ length: count }, (_, i) => count - 1 - i).map((i) => <ProposalCard key={i} id={BigInt(i)} isAdmin={isAdmin} />)}
    </div>
  );
}
