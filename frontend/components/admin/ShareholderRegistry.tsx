"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContracts, usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem } from "viem";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI } from "@/lib/abis";

const KNOWN_NAMES: Record<string, string> = {
  "0x1d599054325fac1f349a46843f0788879779c530": "Account 1 (Admin)",
  "0x31fe085ce31ba1730353d68295aa93ff22504938": "Account 2",
  "0x697a1637b0fc7e23ba1a842b1d213de01c9e17c3": "Account 3",
  "0x7ccf00bd341acabdab1305423ca2d7eb5cc66f2b": "Account 4",
};

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export function ShareholderRegistry({ refreshSignal }: { refreshSignal?: number }) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const [holders, setHolders] = useState<`0x${string}`[]>([]);
  const [scanning, setScanning] = useState(true);

  const fetchHolders = useCallback(async () => {
    if (!publicClient) return;
    setScanning(true);
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > BigInt(50000) ? latest - BigInt(50000) : BigInt(0);
      const logs = await publicClient.getLogs({
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock: "latest",
      });
      const fromEvents = logs
        .map((l) => (l.args.to as string).toLowerCase())
        .filter((addr) => addr !== "0x0000000000000000000000000000000000000000");
      const merged = [...new Set([...Object.keys(KNOWN_NAMES), ...fromEvents])] as `0x${string}`[];
      setHolders(merged);
    } catch (err) {
      console.error("掃描持股人失敗，退回已知清單", err);
      setHolders(Object.keys(KNOWN_NAMES) as `0x${string}`[]);
    } finally {
      setScanning(false);
    }
  }, [publicClient]);

  useEffect(() => { fetchHolders(); }, [fetchHolders]);
  useEffect(() => { if (refreshSignal) fetchHolders(); }, [refreshSignal, fetchHolders]);

  const { data: balanceData, refetch } = useReadContracts({
    contracts: [
      ...holders.map((addr) => ({
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "balanceOf" as const,
        args: [addr],
        chainId: CHAIN_ID,
      })),
      {
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "totalSupply" as const,
        chainId: CHAIN_ID,
      },
    ],
    query: { refetchInterval: 5000, enabled: holders.length > 0 },
  });

  const totalSupply = balanceData?.[holders.length]?.result as bigint | undefined;

  const rows = holders
    .map((addr, i) => {
      const balance = balanceData?.[i]?.result as bigint | undefined;
      const pct =
        balance !== undefined && totalSupply && totalSupply > BigInt(0)
          ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(2)
          : "0.00";
      const name = KNOWN_NAMES[addr.toLowerCase()] ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
      return { addr, name, balance, pct };
    })
    .filter((r) => r.balance !== undefined && r.balance > BigInt(0));

  function handleRefresh() {
    fetchHolders();
    refetch();
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">股東持股總覽</h3>
        <div className="flex items-center gap-3">
          {totalSupply !== undefined && (
            <span className="text-xs text-muted-foreground">
              總發行量：{formatUnits(totalSupply, 18)} 股
            </span>
          )}
          <button onClick={handleRefresh} className="text-xs text-primary hover:underline">
            ↺ 更新
          </button>
        </div>
      </div>

      {scanning ? (
        <p className="text-sm text-muted-foreground">掃描鏈上紀錄中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">目前沒有持股記錄。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left py-1.5 font-medium">帳戶</th>
              <th className="text-left py-1.5 font-medium font-mono">地址</th>
              <th className="text-right py-1.5 font-medium">持股數</th>
              <th className="text-right py-1.5 font-medium">佔比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.addr} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 font-medium">{r.name}</td>
                <td className="py-1.5 font-mono text-xs text-muted-foreground">
                  {r.addr.slice(0, 6)}…{r.addr.slice(-4)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatUnits(r.balance!, 18)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
