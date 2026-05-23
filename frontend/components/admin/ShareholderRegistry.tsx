"use client";

import { useReadContracts } from "wagmi";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { formatUnits } from "viem";

const SHAREHOLDERS = [
  { name: "Account 1 (Admin)", address: "0x1d599054325fac1f349a46843f0788879779c530" as `0x${string}` },
  { name: "Account 2",         address: "0x31fE085cE31BA1730353D68295Aa93FF22504938" as `0x${string}` },
  { name: "Account 3",         address: "0x697a1637b0fC7e23ba1a842B1D213DE01C9E17c3" as `0x${string}` },
  { name: "Account 4",         address: "0x7cCf00BD341aCABdab1305423CA2d7eb5cc66F2B" as `0x${string}` },
];

export function ShareholderRegistry() {
  const { data, isLoading, refetch } = useReadContracts({
    query: { refetchInterval: 5000 },
    contracts: [
      ...SHAREHOLDERS.map((s) => ({
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "balanceOf" as const,
        args: [s.address],
        chainId: CHAIN_ID,
      })),
      {
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "totalSupply" as const,
        chainId: CHAIN_ID,
      },
    ],
  });

  const totalSupply = data?.[SHAREHOLDERS.length]?.result as bigint | undefined;

  const rows = SHAREHOLDERS.map((s, i) => {
    const balance = data?.[i]?.result as bigint | undefined;
    const pct =
      balance !== undefined && totalSupply && totalSupply > BigInt(0)
        ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(2)
        : "0.00";
    return { ...s, balance, pct };
  }).filter((r) => r.balance !== undefined && r.balance > BigInt(0));

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
          <button
            onClick={() => refetch()}
            className="text-xs text-primary hover:underline"
          >
            ↺ 更新
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">讀取中…</p>
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
              <tr key={r.address} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 font-medium">{r.name}</td>
                <td className="py-1.5 font-mono text-xs text-muted-foreground">
                  {r.address.slice(0, 6)}…{r.address.slice(-4)}
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
