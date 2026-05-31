"use client";

import { useState, useCallback, useEffect } from "react";
import { useReadContract, useReadContracts, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "sonner";
import { useContractWrite } from "@/hooks/useContractWrite";
import { CONTRACT_ADDRESSES, CHAIN_ID } from "@/lib/config";
import { DIRECTOR_ELECTION_ABI } from "@/lib/abis";
import { extractRevertReason, formatTimestamp } from "@/lib/utils";
import type { Election } from "@/types/governance";

// ─── Create Election Form ─────────────────────────────────────────────────────

function CreateElectionForm({ onCreated }: { onCreated: () => void }) {
  const { writeContract, isPending } = useContractWrite();
  const [open, setOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState("");
  const [voteEnd, setVoteEnd]         = useState("");
  const [seatCount, setSeatCount]     = useState("1");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingDate || !voteEnd) { toast.error("請填寫所有欄位"); return; }
    const meetingTs = BigInt(Math.floor(new Date(meetingDate).getTime() / 1000));
    const voteEndTs = BigInt(Math.floor(new Date(voteEnd).getTime() / 1000));
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "createElection",
        args: [meetingTs, BigInt(seatCount), voteEndTs],
      });
      toast.success("選舉已建立");
      setOpen(false);
      onCreated();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-4 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium hover:bg-[#1a3570] transition-colors shadow-sm"
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}>
        <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
      </svg>
      建立董事選舉
    </button>
  );

  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#0f2456]">建立董事選舉</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">股東會日期</span>
            <input type="datetime-local" value={meetingDate} onChange={e => setMeetingDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">投票截止時間</span>
            <input type="datetime-local" value={voteEnd} onChange={e => setVoteEnd(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">席次數</span>
            <input type="number" min="1" value={seatCount} onChange={e => setSeatCount(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={isPending}
            className="px-5 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#1a3570] transition-colors">
            {isPending ? "建立中…" : "建立"}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Register Candidate Form ──────────────────────────────────────────────────

function RegisterCandidateForm({ electionId, onAdded }: { electionId: bigint; onAdded: () => void }) {
  const { writeContract, isPending } = useContractWrite();
  const [addr, setAddr]         = useState("");
  const [name, setName]         = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [open, setOpen]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addr.startsWith("0x")) { toast.error("地址格式錯誤"); return; }
    if (!name.trim()) { toast.error("請填寫候選人姓名"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "registerCandidate",
        args: [electionId, addr as `0x${string}`, name.trim(), photoUrl.trim()],
      });
      toast.success(`${name} 已登記為候選人`);
      setAddr(""); setName(""); setPhotoUrl(""); setOpen(false);
      onAdded();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-xs px-3 py-1.5 border border-[#0f2456] text-[#0f2456] rounded-lg hover:bg-blue-50 transition-colors font-medium">
      ＋ 新增候選人
    </button>
  );

  return (
    <div className="border border-border rounded-xl p-4 bg-blue-50/40 space-y-3">
      <p className="text-sm font-semibold text-[#0f2456]">登記候選人</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="候選人地址 0x…" value={addr} onChange={e => setAddr(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <input placeholder="姓名" value={name} onChange={e => setName(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        {/* Photo URL */}
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="預覽" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">無照片</div>
          )}
          <input placeholder="照片網址（可留空）" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={isPending}
            className="px-4 py-2 bg-[#0f2456] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#1a3570] transition-colors">
            {isPending ? "送出中…" : "登記上鏈"}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Single Election Admin Card ───────────────────────────────────────────────

function EditCandidateForm({ addr, onDone }: { addr: string; onDone: () => void }) {
  const { writeContract, isPending } = useContractWrite();
  const [name, setName]         = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("請填寫姓名"); return; }
    try {
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "setCandidateInfo",
        args: [addr as `0x${string}`, name.trim(), photoUrl.trim()],
      });
      toast.success("候選人資料已更新");
      onDone();
    } catch (err) { toast.error(extractRevertReason(err)); }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 border-t border-border pt-2">
      <input placeholder="姓名" value={name} onChange={e => setName(e.target.value)}
        className="w-full px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
      <input placeholder="照片網址（可留空）" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
        className="w-full px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending}
          className="px-3 py-1 bg-[#0f2456] text-white rounded text-xs disabled:opacity-50">
          {isPending ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={onDone}
          className="px-3 py-1 border border-border rounded text-xs hover:bg-muted">
          取消
        </button>
      </div>
    </form>
  );
}

function ElectionAdminCard({ id }: { id: bigint }) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContract, isPending: finalizing } = useContractWrite();
  const { writeContract: removeCandidate, isPending: removing } = useContractWrite();
  const [editingAddr, setEditingAddr] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const { data: electionRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getElection",
    args: [id],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  const { data: candidatesRaw, refetch: refetchCandidates } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "getCandidates",
    args: [id],
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  useEffect(() => { if (refresh > 0) refetchCandidates(); }, [refresh, refetchCandidates]);

  const candidates = (candidatesRaw ?? []) as `0x${string}`[];

  const { data: votesData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "getCandidateVotes" as const,
      args: [id, c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 3000, enabled: candidates.length > 0 },
  });

  const { data: namesData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "candidateName" as const,
      args: [c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 5000, enabled: candidates.length > 0 },
  });

  const { data: photosData } = useReadContracts({
    contracts: candidates.map(c => ({
      address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
      abi: DIRECTOR_ELECTION_ABI,
      functionName: "candidatePhotoUrl" as const,
      args: [c],
      chainId: CHAIN_ID,
    })),
    query: { refetchInterval: 5000, enabled: candidates.length > 0 },
  });

  const handleFinalize = useCallback(async () => {
    if (!publicClient || candidates.length === 0) return;
    try {
      const votes = (votesData ?? []).map(v => (v?.result as bigint) ?? 0n);
      const sorted = candidates
        .map((addr, i) => ({ addr, votes: votes[i] ?? 0n }))
        .sort((a, b) => (b.votes > a.votes ? 1 : b.votes < a.votes ? -1 : 0));
      await writeContract({
        address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
        abi: DIRECTOR_ELECTION_ABI,
        functionName: "finalizeElection",
        args: [id, sorted.map(s => s.addr), sorted.map(s => s.votes)],
      });
      toast.success("選舉已結算");
    } catch (err) { toast.error(extractRevertReason(err)); }
  }, [publicClient, candidates, votesData, id, writeContract]);

  if (!electionRaw) return null;
  const raw = electionRaw as readonly unknown[];
  const election: Election = {
    id: raw[0] as bigint,
    meetingDate: raw[1] as bigint,
    seatCount: raw[2] as bigint,
    voteEnd: raw[3] as bigint,
    snapshotId: raw[4] as bigint,
    finalized: raw[5] as boolean,
    candidateCount: raw[6] as bigint,
  };

  const now = BigInt(Math.floor(Date.now() / 1000));
  const votingEnded = now > election.voteEnd;
  const canFinalize = votingEnded && !election.finalized && candidates.length > 0;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0f2456]">選舉 #{Number(id)}</span>
            {election.finalized && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">已結算</span>
            )}
            {!election.finalized && votingEnded && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">待結算</span>
            )}
            {!election.finalized && !votingEnded && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">投票中</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {Number(election.seatCount)} 席次 ‧ 截止：{formatTimestamp(election.voteEnd)}
          </p>
        </div>
        {canFinalize && (
          <button onClick={handleFinalize} disabled={finalizing}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-emerald-700 transition-colors">
            {finalizing ? "結算中…" : "結算選舉"}
          </button>
        )}
      </div>

      {/* Candidates */}
      <div className="px-5 py-4 space-y-3">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無候選人</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {candidates.map((addr, i) => {
              const name     = (namesData?.[i]?.result as string) || "未設定";
              const photoUrl = (photosData?.[i]?.result as string) || "";
              const votes    = (votesData?.[i]?.result as bigint) ?? 0n;
              return (
                <div key={addr} className="flex flex-col items-center gap-2 p-3 border border-border rounded-xl bg-gray-50 text-center">
                  {photoUrl ? (
                    <img src={photoUrl} alt={name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-200 to-indigo-300 flex items-center justify-center text-xl font-bold text-white shadow">
                      {name[0] ?? "?"}
                    </div>
                  )}
                  <div className="w-full">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{addr.slice(0,6)}…{addr.slice(-4)}</p>
                    <p className="text-xs text-[#0f2456] font-bold mt-1">{Number(formatUnits(votes, 18)).toLocaleString()} 票</p>
                    {editingAddr === addr ? (
                      <EditCandidateForm addr={addr} onDone={() => setEditingAddr(null)} />
                    ) : (
                      !election.finalized && (
                        <button onClick={() => setEditingAddr(addr)}
                          className="text-[10px] text-blue-500 hover:text-blue-700 mt-1 transition-colors">
                          編輯
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!election.finalized && (
          <RegisterCandidateForm
            electionId={id}
            onAdded={() => setRefresh(r => r + 1)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main ElectionManager ─────────────────────────────────────────────────────

export function ElectionManager() {
  const [refresh, setRefresh] = useState(0);

  const { data: nextId, refetch: refetchNextId } = useReadContract({
    address: CONTRACT_ADDRESSES.DIRECTOR_ELECTION,
    abi: DIRECTOR_ELECTION_ABI,
    functionName: "nextElectionId",
    chainId: CHAIN_ID,
    query: { refetchInterval: 3000 },
  });

  useEffect(() => { if (refresh > 0) refetchNextId(); }, [refresh, refetchNextId]);

  const count = nextId ? Number(nextId) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#0f2456]">董事選舉管理</h3>
      </div>
      <CreateElectionForm onCreated={() => setRefresh(r => r + 1)} />
      {Array.from({ length: count }, (_, i) => count - 1 - i).map(i => (
        <ElectionAdminCard key={i} id={BigInt(i)} />
      ))}
      {count === 0 && (
        <p className="text-sm text-muted-foreground">尚無任何董事選舉。</p>
      )}
    </div>
  );
}
