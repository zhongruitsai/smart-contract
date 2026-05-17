"use client";

import { useState } from "react";
import { useReadContracts, useBlock } from "wagmi";
import { toast } from "sonner";
import { useDevAccount } from "@/contexts/DevAccountContext";
import { CONTRACT_ADDRESSES } from "@/lib/config";
import { GOVERNANCE_VOTING_ABI } from "@/lib/abis";
import { extractRevertReason } from "@/lib/utils";

function tsToLocal(ts: bigint | undefined): string {
  if (!ts || ts === BigInt(0)) return "—";
  return new Date(Number(ts) * 1000).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function dateToTs(val: string): bigint {
  return BigInt(Math.floor(new Date(val).getTime() / 1000));
}

function defaultDatetime(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

const STEPS = ["設立會議", "提案期", "投票期", "會議結束"] as const;

function StepDot({ idx, phase }: { idx: number; phase: number }) {
  const done    = idx < phase;
  const current = idx === phase;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
        ${done    ? "bg-green-500 border-green-500 text-white"
        : current ? "bg-blue-600 border-blue-600 text-white"
        :           "bg-white border-gray-300 text-gray-400"}`}>
        {done ? "✓" : idx + 1}
      </div>
      <span className={`text-xs font-medium whitespace-nowrap
        ${done ? "text-green-600" : current ? "text-blue-700" : "text-gray-400"}`}>
        {STEPS[idx]}
      </span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return <div className={`flex-1 h-0.5 mb-5 transition-colors ${done ? "bg-green-400" : "bg-gray-200"}`} />;
}

function Step0Card({ busy, onSubmit }: {
  busy: boolean;
  onSubmit: (meetingDate: string, isPublic: boolean, isExtraordinary: boolean) => void;
}) {
  const [meetingDate, setMeetingDate] = useState(defaultDatetime(45));
  const [isPublic, setIsPublic] = useState(false);
  const [isExtraordinary, setIsExtraordinary] = useState(false);
  const minNotice = isExtraordinary ? (isPublic ? 15 : 10) : (isPublic ? 30 : 20);

  return (
    <div className="space-y-3">
      <InfoBox>
        開放股東提案前，須先設定本次股東會日期。系統將自動計算
        <strong className="text-blue-700"> 提案截止日</strong>（會議前 {minNotice + 10} 天）
        與<strong className="text-blue-700"> 最晚開投日</strong>（會議前 {minNotice} 天）。
      </InfoBox>
      <label className="block text-xs font-medium text-gray-600">股東會日期</label>
      <input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          公開發行公司
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isExtraordinary} onChange={(e) => setIsExtraordinary(e.target.checked)} />
          臨時股東會
        </label>
      </div>
      <ActionButton disabled={busy || !meetingDate} onClick={() => onSubmit(meetingDate, isPublic, isExtraordinary)}>
        {busy ? "送出中…" : "開放提案期 →"}
      </ActionButton>
    </div>
  );
}

function Step1Card({ pDeadline, vDeadline, nextProposalId, blockTimestamp, busy, onStartVoting, onClose }: {
  pDeadline: bigint | undefined;
  vDeadline: bigint | undefined;
  nextProposalId: bigint | undefined;
  blockTimestamp: bigint;
  busy: boolean;
  onStartVoting: (id: string, voteEnd: string) => void;
  onClose: () => void;
}) {
  const [proposalId, setProposalId] = useState("0");
  const [voteEnd, setVoteEnd] = useState(defaultDatetime(35));
  const proposingOver = pDeadline ? blockTimestamp > pDeadline : false;
  const count = nextProposalId ? Number(nextProposalId) : 0;

  return (
    <div className="space-y-3">
      <InfoBox>股東可在提案截止日前提交提案。截止後，管理員需逐一為每個提案開放電子投票。</InfoBox>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="提案截止" value={tsToLocal(pDeadline)} />
        <Stat label="最晚開投" value={tsToLocal(vDeadline)} />
        <Stat label="目前提案數" value={`${count} 件`} />
        <Stat label="提案期狀態" value={proposingOver ? "已截止 ✓" : "進行中…"} highlight={proposingOver} />
      </div>
      {!proposingOver && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">⚠ 提案期尚未截止，請使用底部時間控制器快轉至截止日後，再開放投票。</p>
      )}
      {proposingOver && count === 0 && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">目前沒有提案，可直接關閉本次會議。</p>
      )}
      {proposingOver && count > 0 && (
        <div className="space-y-2 pt-1 border-t">
          <p className="text-xs font-medium text-gray-600">為提案開放電子投票</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">提案編號（0 ~ {count - 1}）</label>
              <input type="number" min={0} max={count - 1} value={proposalId} onChange={(e) => setProposalId(e.target.value)} className="w-full px-3 py-1.5 border rounded text-sm mt-0.5" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">投票截止日</label>
              <input type="datetime-local" value={voteEnd} onChange={(e) => setVoteEnd(e.target.value)} className="w-full px-3 py-1.5 border rounded text-sm mt-0.5" />
            </div>
          </div>
          <ActionButton disabled={busy || !voteEnd} onClick={() => onStartVoting(proposalId, voteEnd)}>
            {busy ? "送出中…" : "開放此提案投票 →"}
          </ActionButton>
        </div>
      )}
      <button disabled={busy} onClick={onClose} className="w-full py-1.5 border border-red-300 text-red-500 rounded text-sm hover:bg-red-50 disabled:opacity-40 transition-colors">
        關閉本次會議
      </button>
    </div>
  );
}

function Step2Card({ nextProposalId, busy, onClose }: { nextProposalId: bigint | undefined; busy: boolean; onClose: () => void }) {
  const count = nextProposalId ? Number(nextProposalId) : 0;
  return (
    <div className="space-y-3">
      <InfoBox>投票期間，股東可在各提案卡片上進行投票或委託。投票截止後，任何人可點擊提案卡片上的「結算提案」按鈕完成計票。所有提案結算完畢後，關閉本次會議。</InfoBox>
      <Stat label="進行中提案" value={`${count} 件`} />
      <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">ℹ 股東頁面的提案列表中，投票截止後會出現「結算提案」按鈕。</p>
      <button disabled={busy} onClick={onClose} className="w-full py-1.5 border border-red-300 text-red-500 rounded text-sm hover:bg-red-50 disabled:opacity-40 transition-colors">
        關閉本次會議
      </button>
    </div>
  );
}

function Step3Card({ onReopen, busy }: { onReopen: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <InfoBox>本次股東會已結束。所有提案結果可在股東頁面查閱。若需召開下次股東會，請點擊下方按鈕重新設立。</InfoBox>
      <ActionButton disabled={busy} onClick={onReopen}>{busy ? "送出中…" : "召開下次股東會 →"}</ActionButton>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{children}</p>;
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-muted/40 rounded p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-green-600" : ""}`}>{value}</p>
    </div>
  );
}

function ActionButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors">
      {children}
    </button>
  );
}

export function PhaseController() {
  const { writeContract, isPending } = useDevAccount();

  const { data: block } = useBlock({ watch: true, chainId: 31337, query: { refetchInterval: 3000 } });
  const blockTimestamp = block?.timestamp ?? BigInt(0);

  const { data, refetch } = useReadContracts({
    query: { refetchInterval: 3000 },
    contracts: [
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "currentPhase", chainId: 31337 },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "proposingDeadline", chainId: 31337 },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "votingStartDeadline", chainId: 31337 },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "nextProposalId", chainId: 31337 },
      { address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "currentMeetingDate", chainId: 31337 },
    ],
  });

  const phase          = (data?.[0]?.result as number | undefined) ?? 0;
  const pDeadline      = data?.[1]?.result as bigint | undefined;
  const vDeadline      = data?.[2]?.result as bigint | undefined;
  const nextProposalId = data?.[3]?.result as bigint | undefined;
  const meetingDate    = data?.[4]?.result as bigint | undefined;

  async function openPhase(meetingDateStr: string, isPublic: boolean, isExtraordinary: boolean) {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "openProposingPhase", args: [dateToTs(meetingDateStr), isPublic, isExtraordinary] });
      toast.success("提案期已開放"); refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  async function startVoting(id: string, voteEndStr: string) {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "startVoting", args: [BigInt(id || "0"), dateToTs(voteEndStr)] });
      toast.success("投票已開放"); refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  async function closePhase() {
    try {
      await writeContract({ address: CONTRACT_ADDRESSES.GOVERNANCE_VOTING, abi: GOVERNANCE_VOTING_ABI, functionName: "closePhase", args: [] });
      toast.success("會議已關閉"); refetch();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  const displayPhase = phase === 3 ? 3 : phase;

  return (
    <div className="border rounded-xl p-5 space-y-5 bg-white">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">會議流程控制</h3>
        {meetingDate && meetingDate > BigInt(0) && (
          <span className="text-xs text-muted-foreground">會議日期：{tsToLocal(meetingDate)}</span>
        )}
      </div>
      <div className="flex items-center px-1">
        <StepDot idx={0} phase={displayPhase} />
        <StepConnector done={displayPhase > 0} />
        <StepDot idx={1} phase={displayPhase} />
        <StepConnector done={displayPhase > 1} />
        <StepDot idx={2} phase={displayPhase} />
        <StepConnector done={displayPhase > 2} />
        <StepDot idx={3} phase={displayPhase} />
      </div>
      <div className="border border-blue-100 rounded-lg p-4 bg-blue-50/30 space-y-3">
        {(phase === 0 || phase === 3) && <Step0Card busy={isPending} onSubmit={openPhase} />}
        {phase === 1 && <Step1Card pDeadline={pDeadline} vDeadline={vDeadline} nextProposalId={nextProposalId} blockTimestamp={blockTimestamp} busy={isPending} onStartVoting={startVoting} onClose={closePhase} />}
        {phase === 2 && <Step2Card nextProposalId={nextProposalId} busy={isPending} onClose={closePhase} />}
        {phase === 3 && <Step3Card busy={isPending} onReopen={() => openPhase(defaultDatetime(45), false, false)} />}
      </div>
    </div>
  );
}
