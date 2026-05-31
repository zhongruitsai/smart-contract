"use client";

import { useReadContracts } from "wagmi";
import { useAccount } from "wagmi";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { GOVERNANCE_TOKEN_ABI, GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { PHASE_LABELS } from "@/lib/utils";
import { formatUnits } from "viem";

export function StatusCard() {
  const { address } = useAccount();

  const { data } = useReadContracts({
    query: { refetchInterval: 3000 },
    contracts: [
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN, abi: GOVERNANCE_TOKEN_ABI, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"], chainId: CHAIN_ID },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_TOKEN, abi: GOVERNANCE_TOKEN_ABI, functionName: "totalSupply", chainId: CHAIN_ID },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "currentPhase", chainId: CHAIN_ID },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "nextProposalId", chainId: CHAIN_ID },
    ],
  });

  const balance = data?.[0]?.result as bigint | undefined;
  const totalSupply = data?.[1]?.result as bigint | undefined;
  const phase = data?.[2]?.result as number | undefined;
  const nextId = data?.[3]?.result as bigint | undefined;

  const shares = balance !== undefined ? Number(formatUnits(balance, 18)).toLocaleString() : "—";
  const pct = balance !== undefined && totalSupply && totalSupply > 0n
    ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(2)
    : "0.00";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        label="我的持股"
        value={balance !== undefined ? shares : "—"}
        sub={balance !== undefined ? `佔比 ${pct}%` : undefined}
        accent="blue"
        icon={
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" strokeLinecap="round"/>
          </svg>
        }
      />
      <StatCard
        label="目前階段"
        value={phase !== undefined ? PHASE_LABELS[phase] : "—"}
        accent="indigo"
        icon={
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.8}>
            <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
      />
      <StatCard
        label="提案總數"
        value={nextId !== undefined ? `${Number(nextId)} 件` : "—"}
        accent="violet"
        icon={
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.8}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
      />
    </div>
  );
}

const accentMap = {
  blue:   { bg: "bg-blue-50",   icon: "bg-blue-100 text-blue-600",   value: "text-blue-700" },
  indigo: { bg: "bg-indigo-50", icon: "bg-indigo-100 text-indigo-600", value: "text-indigo-700" },
  violet: { bg: "bg-violet-50", icon: "bg-violet-100 text-violet-600", value: "text-violet-700" },
};

function StatCard({ label, value, sub, accent, icon }: {
  label: string; value: string; sub?: string;
  accent: keyof typeof accentMap;
  icon: React.ReactNode;
}) {
  const c = accentMap[accent];
  return (
    <div className={`rounded-xl border border-border ${c.bg} p-4 flex items-center gap-4 shadow-sm`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.icon}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className={`text-lg font-bold leading-tight ${c.value}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
