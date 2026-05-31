"use client";

import { useState } from "react";
import { TokenMinter } from "./TokenMinter";
import { PhaseController } from "./PhaseController";
import { ShareholderRegistry } from "./ShareholderRegistry";
import { ElectionManager } from "./ElectionManager";

export function AdminDashboard() {
  const [registrySignal, setRegistrySignal] = useState(0);

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold text-[#0f2456]">管理員操作台</h2>
      <ShareholderRegistry refreshSignal={registrySignal} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TokenMinter onSuccess={() => setRegistrySignal(s => s + 1)} />
        <PhaseController />
      </div>
      <ElectionManager />
    </section>
  );
}
