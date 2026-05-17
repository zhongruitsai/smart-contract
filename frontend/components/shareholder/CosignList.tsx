"use client";

import { useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBlock } from "wagmi";
import { toast } from "sonner";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, formatTimestamp } from "@/lib/utils";
import type { Proposal } from "@/types/governance";

export function CosignList({ proposal }: { proposal: Proposal }) {
  const { address } = useAccount();

  const { data: alreadyCosigned } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "hasCosigned",
    args: [proposal.id, address ?? "0x0"],
  });

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash });
  const { data: block } = useBlock({ watch: true, query: { refetchInterval: 3000 } });
  const blockTs = block?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const cosignOpen = proposal.cosignDeadline > BigInt(0) && blockTs <= proposal.cosignDeadline;
  const busy = isPending || isConfirming;

  useEffect(() => { if (writeError) toast.error(extractRevertReason(writeError)); }, [writeError]);
  useEffect(() => { if (receiptError) toast.error(extractRevertReason(receiptError)); }, [receiptError]);
  useEffect(() => { if (isSuccess) toast.success("聯署成功上鏈"); }, [isSuccess]);

  function cosign() {
    writeContract({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: "cosign",
      args: [proposal.id],
    });
  }

  if (!proposal.isCosignProposal) return null;

  return (
    <div className="space-y-1 text-sm bg-muted/30 rounded p-2">
      <p className="text-xs text-muted-foreground">
        聯署進度：{Number(proposal.cosignerCount)}/10 ｜ 截止：{formatTimestamp(proposal.cosignDeadline)}
      </p>
      {!proposal.isActive && cosignOpen && !alreadyCosigned && (
        <button onClick={cosign} disabled={busy} className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded text-sm disabled:opacity-50">
          {busy ? "送出中…" : "我要聯署"}
        </button>
      )}
      {!proposal.isActive && !cosignOpen && (
        <p className="text-xs text-red-500">聯署截止已過，提案未達門檻。</p>
      )}
      {alreadyCosigned && <p className="text-xs text-green-600">您已聯署此提案。</p>}
      {proposal.isActive && <p className="text-xs text-green-600">已達 10 人聯署，提案生效。</p>}
    </div>
  );
}
