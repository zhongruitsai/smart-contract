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
// Chain ID: 31337 = local Anvil, 11155111 = Sepolia
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111") as 31337 | 11155111;

// Block at which contracts were deployed — use as event scan start point
export const DEPLOY_BLOCK: Record<number, bigint> = {
  11155111: BigInt("0xa73764"), // Sepolia deployment block (DirectorElection redeploy)
  31337:    BigInt(0),          // local Hardhat
};

export const CONTRACT_ADDRESSES = {
  GOVERNANCE_TOKEN:  (process.env.NEXT_PUBLIC_GOVERNANCE_TOKEN  ?? "0xF9174f94d91cBdb968d5F48a28Fb98a917E2C041") as `0x${string}`,
  GOVERNANCE_VOTING: (process.env.NEXT_PUBLIC_GOVERNANCE_VOTING ?? "0xEb7f94cC456053E9592b8859b336F525a31FB613") as `0x${string}`,
  DIRECTOR_ELECTION: (process.env.NEXT_PUBLIC_DIRECTOR_ELECTION ?? "0x9F3ab6E261857d13978C2DcA9670b0479e8ffCcD") as `0x${string}`,
};

import { http, createConfig } from "wagmi";
import { hardhat, sepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
    [mainnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
