import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BaseError, ContractFunctionRevertedError } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(ts: bigint): string {
  if (ts === BigInt(0)) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function extractRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.shortMessage;
    }
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const PHASE_LABELS = ["尚未開始", "提案中", "投票中", "已結束"] as const;
export const PROPOSAL_TYPE_LABELS = ["普通決議", "特別決議", "修改章程", "解散公司", "公發特別決議"] as const;
export const VOTE_RESULT_LABELS = ["待定", "通過", "未通過"] as const;
