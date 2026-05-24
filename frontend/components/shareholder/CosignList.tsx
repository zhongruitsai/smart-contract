"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, formatTimestamp } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

export function CosignList({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useContractWrite();

  const { data: alreadyCosigned, refetch: refetchCosigned } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "hasCosigned",
    args: [proposal.id, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: CHAIN_ID,
  });

  const { data: contractTime } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "currentTime",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });
  const blockTs = (contractTime as bigint | undefined) ?? BigInt(Math.floor(Date.now() / 1000));
  const cosignOpen = proposal.cosignDeadline > BigInt(0) && blockTs <= proposal.cosignDeadline;

  async function cosign() {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "cosign", args: [proposal.id] });
      toast.success("聯署成功上鏈");
      refetchCosigned();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (!proposal.isCosignProposal) return null;

  return (
    <div className="space-y-1 text-sm bg-muted/30 rounded p-2">
      <p className="text-xs text-muted-foreground">
        聯署進度：{Number(proposal.cosignerCount)}/10 ｜ 截止：{formatTimestamp(proposal.cosignDeadline)}
      </p>
      {!proposal.isActive && cosignOpen && !alreadyCosigned && (
        <button onClick={cosign} disabled={isPending} className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50">
          {isPending ? "送出中…" : "我要聯署"}
        </button>
      )}
      {!proposal.isActive && !cosignOpen && <p className="text-xs text-red-500">聯署截止已過，提案未達門檻。</p>}
      {alreadyCosigned && <p className="text-xs text-green-600">您已聯署此提案。</p>}
      {proposal.isActive && <p className="text-xs text-green-600">已達 10 人聯署，提案生效。</p>}
    </div>
  );
}
