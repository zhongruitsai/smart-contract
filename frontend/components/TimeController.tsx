"use client";

import { useReadContract, useChainId } from "wagmi";
import { useState } from "react";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI, DIRECTOR_ELECTION_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";

const ANVIL_RPC = "http://127.0.0.1:8545";

async function warpAnvil(seconds: number) {
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 1 }),
  });
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 2 }),
  });
}

function tsToLocal(ts: bigint | undefined): string {
  if (!ts) return "讀取中…";
  return new Date(Number(ts) * 1000).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

const PRESETS = [
  { label: "+1 天",  seconds: 86400 },
  { label: "+7 天",  seconds: 604800 },
  { label: "+10 天", seconds: 864000 },
  { label: "+15 天", seconds: 1296000 },
  { label: "+20 天", seconds: 1728000 },
  { label: "+30 天", seconds: 2592000 },
  { label: "+60 天", seconds: 5184000 },
];

export function TimeController() {
  const chainId = useChainId();
  const isLocal = chainId === 31337;
  const { writeContract, isPending } = useContractWrite();
  const [custom, setCustom] = useState("");
  const [localLoading, setLocalLoading] = useState(false);

  const { data: currentTime, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
    abi: GOVERNANCE_VOTING_ABI,
    functionName: "currentTime",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const blockTime = tsToLocal(currentTime as bigint | undefined);

  async function handleWarp(seconds: number) {
    try {
      if (isLocal) {
        setLocalLoading(true);
        await warpAnvil(seconds);
        await refetch();
      } else {
        await writeContract({
          address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING,
          abi: GOVERNANCE_VOTING_ABI,
          functionName: "addTimeOffset",
          args: [BigInt(seconds)],
        });
        await writeContract({
          address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
          abi: DIRECTOR_ELECTION_ABI,
          functionName: "addTimeOffset",
          args: [BigInt(seconds)],
        });
        await refetch();
      }
      toast.success(`已快轉 ${Math.round(seconds / 86400)} 天`);
    } catch (err) {
      toast.error(isLocal ? "快轉失敗（確認 Anvil 是否在執行中）" : extractRevertReason(err));
    } finally {
      setLocalLoading(false);
    }
  }

  async function handleCustom() {
    const days = Number(custom);
    if (!days || days <= 0) { toast.error("請輸入天數"); return; }
    await handleWarp(days * 86400);
    setCustom("");
  }

  const loading = isPending || localLoading;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-amber-50 border-amber-200">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-amber-800">⏱ 區塊鏈時間</h3>
        <button onClick={() => refetch()} className="text-xs text-amber-600 hover:underline">重新整理</button>
      </div>

      <div className="font-mono text-sm bg-white rounded px-3 py-2 border border-amber-200">
        {blockTime}
      </div>

      <div>
        <p className="text-xs text-amber-700 mb-2 font-medium">快轉時間（管理員專用）</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleWarp(p.seconds)}
              disabled={loading}
              className="px-2.5 py-1 text-xs rounded bg-amber-100 hover:bg-amber-200 text-amber-800 disabled:opacity-50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="自訂天數"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          min="1"
          className="w-28 px-2 py-1 border border-amber-200 rounded text-sm bg-white"
        />
        <button
          onClick={handleCustom}
          disabled={loading || !custom}
          className="px-3 py-1 text-sm rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : "快轉"}
        </button>
      </div>
    </div>
  );
}
