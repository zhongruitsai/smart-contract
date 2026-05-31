// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GovernanceToken.sol";
import "../src/DirectorElection.sol";

/**
 * @notice Redeploy only DirectorElection and wire it to the existing GovernanceToken.
 *
 * Usage (Sepolia):
 *   forge script script/DeployDirectorElection.s.sol \
 *     --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast --verify
 *
 * Required env vars:
 *   PRIVATE_KEY            — deployer private key
 *   GOVERNANCE_TOKEN_ADDR  — existing GovernanceToken address
 */
contract DeployDirectorElection is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddr = vm.envAddress("GOVERNANCE_TOKEN_ADDR");

        vm.startBroadcast(deployerPrivateKey);

        DirectorElection election = new DirectorElection(tokenAddr);
        GovernanceToken(tokenAddr).addSnapshotCaller(address(election));

        vm.stopBroadcast();

        console.log("DirectorElection:", address(election));
        console.log("GovernanceToken :", tokenAddr);
    }
}
