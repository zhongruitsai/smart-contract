"use client";

import { TokenMinter } from "./TokenMinter";
import { PhaseController } from "./PhaseController";
import { ShareholderRegistry } from "./ShareholderRegistry";

export function AdminDashboard() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-blue-700">管理員操作台</h2>
      <ShareholderRegistry />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TokenMinter />
        <PhaseController />
      </div>
    </section>
  );
}
