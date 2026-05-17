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
  GOVERNANCE_TOKEN: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`,
  GOVERNANCE_VOTING: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as `0x${string}`,
  DIRECTOR_ELECTION: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as `0x${string}`,
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
