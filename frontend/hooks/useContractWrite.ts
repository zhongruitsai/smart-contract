"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import type { Abi } from "viem";

interface WriteParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export function useContractWrite() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const [isWaiting, setIsWaiting] = useState(false);

  async function writeContract(params: WriteParams): Promise<`0x${string}`> {
    const hash = await writeContractAsync(params as Parameters<typeof writeContractAsync>[0]);
    if (publicClient) {
      setIsWaiting(true);
      try {
        await publicClient.waitForTransactionReceipt({ hash });
      } finally {
        setIsWaiting(false);
      }
    }
    return hash;
  }

  return { writeContract, isPending: isPending || isWaiting };
}
