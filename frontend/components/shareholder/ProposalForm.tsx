"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, PROPOSAL_TYPE_LABELS } from "@/lib/utils";

export function ProposalForm() {
  const [description, setDescription] = useState("");
  const [pType, setPType] = useState<number>(0);
  const [isCosign, setIsCosign] = useState(false);
  const [open, setOpen] = useState(false);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash });

  const busy = isPending || isConfirming;

  useEffect(() => {
    if (writeError) toast.error(extractRevertReason(writeError));
  }, [writeError]);

  useEffect(() => {
    if (receiptError) toast.error(extractRevertReason(receiptError));
  }, [receiptError]);

  useEffect(() => {
    if (isSuccess) {
      toast.success("提案已成功上鏈");
      setDescription("");
      setOpen(false);
    }
  }, [isSuccess]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("請填寫提案內容");
      return;
    }
    writeContract({
      address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
      abi: GOVERNANCE_VOTING_ABI,
      functionName: isCosign ? "createCosignProposal" : "createProposal",
      args: [description, pType],
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
      >
        ＋ 新增提案
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">建立提案</h3>
      <textarea
        placeholder="提案內容（最多 900 字元）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={900}
        rows={3}
        className="w-full px-3 py-2 border rounded text-sm resize-none"
      />
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={pType}
          onChange={(e) => setPType(Number(e.target.value))}
          className="px-3 py-2 border rounded text-sm"
        >
          {PROPOSAL_TYPE_LABELS.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isCosign} onChange={(e) => setIsCosign(e.target.checked)} />
          聯署提案（需 10 位聯署人，集體持股 ≥ 1%）
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
        >
          {busy ? "送出中…" : "送出"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded text-sm">
          取消
        </button>
      </div>
    </form>
  );
}
