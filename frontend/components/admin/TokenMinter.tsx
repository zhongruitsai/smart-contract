"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { useDevAccount } from "@/contexts/DevAccountContext";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";

export function TokenMinter() {
  const { writeContract, isPending } = useDevAccount();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.startsWith("0x") || !amount) {
      toast.error("請填入收款地址與數量");
      return;
    }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "mint",
        args: [recipient as `0x${string}`, parseUnits(amount, 18)],
      });
      toast.success(`成功發行 ${amount} 股份給 ${recipient.slice(0, 6)}…${recipient.slice(-4)}`);
      setAmount("");
      setRecipient("");
    } catch (err) {
      toast.error(extractRevertReason(err));
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">發行股份代幣</h3>
      <form onSubmit={handleMint} className="space-y-2">
        <input
          type="text"
          placeholder="收款地址 0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <input
          type="number"
          placeholder="數量（整數，例如 400）"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !recipient || !amount}
          className="w-full py-2 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
        >
          {isPending ? "確認中…" : "發行"}
        </button>
      </form>
    </div>
  );
}
