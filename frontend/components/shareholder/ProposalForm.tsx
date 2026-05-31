"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason, PROPOSAL_TYPE_LABELS } from "@/lib/utils";

export function ProposalForm({ onSuccess }: { onSuccess?: () => void }) {
  const { writeContract, isPending } = useContractWrite();
  const [description, setDescription] = useState("");
  const [pType, setPType] = useState<number>(0);
  const [isCosign, setIsCosign] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { toast.error("請填寫提案內容"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
        abi: GOVERNANCE_VOTING_ABI,
        functionName: isCosign ? "createCosignProposal" : "createProposal",
        args: [description, pType],
      });
      toast.success("提案已成功上鏈");
      setDescription("");
      setOpen(false);
      onSuccess?.();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium hover:bg-[#1a3570] transition-colors shadow-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}>
          <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
        </svg>
        新增提案
      </button>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#0f2456]">建立提案</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          placeholder="提案內容（最多 900 字元）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={900}
          rows={3}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        />
        <div className="flex flex-wrap gap-4 items-center">
          <select
            value={pType}
            onChange={(e) => setPType(Number(e.target.value))}
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {PROPOSAL_TYPE_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCosign}
              onChange={(e) => setIsCosign(e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-muted-foreground">聯署提案（需 10 位聯署人）</span>
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#1a3570] transition-colors"
          >
            {isPending ? "送出中…" : "送出提案"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
