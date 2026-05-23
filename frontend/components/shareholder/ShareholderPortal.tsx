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
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">股東操作區</h2>
      <StatusCard />

      <div className="flex gap-2 border-b">
        {(["proposals", "election"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"
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
