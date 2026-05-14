// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GovernanceToken.sol";
import "../src/GovernanceVoting.sol";
import "../src/DirectorElection.sol";

/**
 * @notice Deploy the three governance contracts and wire snapshot caller permissions.
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
 */
contract DeployGovernance is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        GovernanceToken govToken = new GovernanceToken("CorpGovToken", "CGT");
        GovernanceVoting voting = new GovernanceVoting(address(govToken));
        DirectorElection election = new DirectorElection(address(govToken));

        // Both downstream contracts must be able to trigger snapshots.
        govToken.addSnapshotCaller(address(voting));
        govToken.addSnapshotCaller(address(election));

        vm.stopBroadcast();

        console.log("GovernanceToken :", address(govToken));
        console.log("GovernanceVoting:", address(voting));
        console.log("DirectorElection:", address(election));
    }
}
