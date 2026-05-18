/**
 * Contract Addresses — fill in after deployment
 *
 * Local (Anvil):
 *   1. `anvil` (leave running)
 *   2. `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`
 *   3. Copy the three addresses printed in the console.
 *
 * Testnet (Sepolia):
 *   1. Set PRIVATE_KEY and RPC_URL in a .env file.
 *   2. `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify`
 *   3. Copy the three addresses from Etherscan or the run output.
 */
export const CONTRACT_ADDRESSES = {
  GOVERNANCE_TOKEN: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d" as `0x${string}`,
  GOVERNANCE_VOTING: "0x59b670e9fA9D0A427751Af201D676719a970857b" as `0x${string}`,
  DIRECTOR_ELECTION: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1" as `0x${string}`,
} as const;

import { http, createConfig } from "wagmi";
import { hardhat, sepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
