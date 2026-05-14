"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "wagmi/chains";
import type { Abi } from "viem";

// ── Anvil 預設帳戶 ────────────────────────────────────────────────────────────

export const ANVIL_ACCOUNTS = [
  { name: "Admin（部署者）", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`, privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}` },
  { name: "Alice",           address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`, privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}` },
  { name: "Bob",             address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`, privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as `0x${string}` },
  { name: "Carol",           address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as `0x${string}`, privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as `0x${string}` },
  { name: "Dave",            address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as `0x${string}`, privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as `0x${string}` },
  { name: "Eve",             address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}`, privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as `0x${string}` },
  { name: "Frank",           address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as `0x${string}`, privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as `0x${string}` },
  { name: "Grace",           address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as `0x${string}`, privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as `0x${string}` },
  { name: "Henry",           address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as `0x${string}`, privateKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97" as `0x${string}` },
  { name: "Ivan",            address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as `0x${string}`, privateKey: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as `0x${string}` },
] as const;

// ── viem clients ──────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: hardhat,
  transport: http("http://127.0.0.1:8545"),
});

function makeWalletClient(privateKey: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: hardhat,
    transport: http("http://127.0.0.1:8545"),
  });
}

// ── Context ───────────────────────────────────────────────────────────────────

interface WriteContractParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

interface DevAccountContextType {
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  address: `0x${string}`;
  name: string;
  writeContract: (params: WriteContractParams) => Promise<`0x${string}`>;
  isPending: boolean;
}

const DevAccountContext = createContext<DevAccountContextType | null>(null);

export function DevAccountProvider({ children }: { children: ReactNode }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, setIsPending] = useState(false);

  const current = ANVIL_ACCOUNTS[selectedIndex];

  const writeContract = useCallback(async (params: WriteContractParams): Promise<`0x${string}`> => {
    setIsPending(true);
    try {
      const wc = makeWalletClient(current.privateKey);
      const hash = await wc.writeContract(params as Parameters<typeof wc.writeContract>[0]);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } finally {
      setIsPending(false);
    }
  }, [current.privateKey]);

  return (
    <DevAccountContext.Provider value={{
      selectedIndex,
      setSelectedIndex,
      address: current.address,
      name: current.name,
      writeContract,
      isPending,
    }}>
      {children}
    </DevAccountContext.Provider>
  );
}

export function useDevAccount() {
  const ctx = useContext(DevAccountContext);
  if (!ctx) throw new Error("useDevAccount must be used within DevAccountProvider");
  return ctx;
}
