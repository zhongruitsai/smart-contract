"use client";

import { useReadContracts } from "wagmi";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI } from "@/lib/abis";
import { formatUnits } from "viem";

const SHAREHOLDERS = [
  { name: "Alice",  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}` },
  { name: "Bob",    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}` },
  { name: "Carol",  address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as `0x${string}` },
  { name: "Dave",   address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as `0x${string}` },
  { name: "Eve",    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}` },
  { name: "Frank",  address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as `0x${string}` },
  { name: "Grace",  address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as `0x${string}` },
  { name: "Henry",  address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as `0x${string}` },
  { name: "Ivan",   address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as `0x${string}` },
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
        chainId: 31337,
      })),
      {
        address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "totalSupply" as const,
        chainId: 31337,
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
