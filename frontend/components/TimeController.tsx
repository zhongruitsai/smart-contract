"use client";

import { useBlock } from "wagmi";
import { useState } from "react";
import { toast } from "sonner";

const ANVIL_RPC = "http://127.0.0.1:8545";

async function warpTime(seconds: number) {
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
  const { data: block, refetch } = useBlock({ watch: false, chainId: 31337 });
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  const blockTime = block?.timestamp
    ? new Date(Number(block.timestamp) * 1000).toLocaleString("zh-TW", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      })
    : "讀取中…";

  async function handleWarp(seconds: number) {
    if (loading) return;
    setLoading(true);
    try {
      await warpTime(seconds);
      await refetch();
      toast.success(`已快轉 ${Math.round(seconds / 86400)} 天`);
    } catch {
      toast.error("快轉失敗（確認 Anvil 是否在執行中）");
    } finally {
      setLoading(false);
    }
  }

  async function handleCustom() {
    const days = Number(custom);
    if (!days || days <= 0) { toast.error("請輸入天數"); return; }
    await handleWarp(days * 86400);
    setCustom("");
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-amber-50 border-amber-200">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-amber-800">⏱ 區塊鏈時間</h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-amber-600 hover:underline"
        >
          重新整理
        </button>
      </div>

      <div className="font-mono text-sm bg-white rounded px-3 py-2 border border-amber-200">
        {blockTime}
        {block?.number !== undefined && (
          <span className="ml-3 text-xs text-muted-foreground">Block #{Number(block.number)}</span>
        )}
      </div>

      <div>
        <p className="text-xs text-amber-700 mb-2 font-medium">快轉時間（僅限本地測試）</p>
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
          快轉
        </button>
      </div>
    </div>
  );
}
