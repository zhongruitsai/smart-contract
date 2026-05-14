"use client";

import { useAccount, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI, GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { PHASE_LABELS } from "@/lib/utils";
import { formatUnits } from "viem";

export function StatusCard() {
  const { address } = useAccount();

  const { data } = useReadContracts({
    query: { refetchInterval: 3000 },
    contracts: [
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN, abi: GOVERNANCE_TOKEN_ABI, functionName: "balanceOf", args: [address ?? "0x0"] },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN, abi: GOVERNANCE_TOKEN_ABI, functionName: "totalSupply" },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "currentPhase" },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "nextProposalId" },
    ],
  });

  const balance = data?.[0]?.result as bigint | undefined;
  const totalSupply = data?.[1]?.result as bigint | undefined;
  const phase = data?.[2]?.result as number | undefined;
  const nextId = data?.[3]?.result as bigint | undefined;

  const pct =
    balance !== undefined && totalSupply && totalSupply > BigInt(0)
      ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(2)
      : "0.00";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat label="我的持股" value={balance !== undefined ? `${formatUnits(balance, 18)} 股（${pct}%）` : "—"} />
      <Stat label="目前階段" value={phase !== undefined ? PHASE_LABELS[phase] : "—"} />
      <Stat label="提案總數" value={nextId !== undefined ? `${Number(nextId)} 件` : "—"} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
