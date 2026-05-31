"use client";

import { useState } from "react";
import { StatusCard } from "./StatusCard";
import { ProposalForm } from "./ProposalForm";
import { ProposalList } from "./ProposalList";
import { ElectionPanel } from "../election/ElectionPanel";

type Tab = "proposals" | "election";

export function ShareholderPortal() {
  const [tab, setTab] = useState<Tab>("proposals");
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0f2456]">股東操作區</h2>
      </div>

      <StatusCard />

      <div className="flex gap-1 bg-white border border-border rounded-xl p-1 w-fit shadow-sm">
        {(["proposals", "election"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm rounded-lg font-medium transition-all ${
              tab === t
                ? "bg-[#0f2456] text-white shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "proposals" ? "提案與投票" : "董事選舉"}
          </button>
        ))}
      </div>

      {tab === "proposals" && (
        <div className="space-y-4">
          <ProposalForm onSuccess={() => setRefreshSignal(s => s + 1)} />
          <ProposalList refreshSignal={refreshSignal} />
        </div>
      )}
      {tab === "election" && <ElectionPanel />}
    </section>
  );
}
