// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceToken.sol";

contract GovernanceTokenTest is Test {
    GovernanceToken token;

    address owner;
    address alice;
    address bob;
    address carol;
    address unauthorized;

    function setUp() public {
        owner        = makeAddr("owner");
        alice        = makeAddr("alice");
        bob          = makeAddr("bob");
        carol        = makeAddr("carol");
        unauthorized = makeAddr("unauthorized");

        vm.prank(owner);
        token = new GovernanceToken("CorpGovToken", "CGT");
    }

    // ─── Minting ──────────────────────────────────────────────────────────────

    function test_Mint_Succeeds() public {
        vm.prank(owner);
        token.mint(alice, 100e18);
        assertEq(token.balanceOf(alice), 100e18);
    }

    function test_RevertWhen_NonOwnerMints() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        token.mint(alice, 100e18);
    }

    // ─── Transfers ────────────────────────────────────────────────────────────

    function test_Transfer_Succeeds() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        bool ok = token.transfer(bob, 40e18);
        assertTrue(ok);
        assertEq(token.balanceOf(alice), 60e18);
        assertEq(token.balanceOf(bob), 40e18);
    }

    function test_TransferFrom_Succeeds() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        token.approve(carol, 50e18);

        vm.prank(carol);
        bool ok = token.transferFrom(alice, bob, 50e18);
        assertTrue(ok);
        assertEq(token.balanceOf(bob), 50e18);
    }

    function test_Transfer_DoesNotAffectSnapshotBalance() public {
        vm.startPrank(owner);
        token.mint(alice, 100e18);
        uint256 snapId = token.takeSnapshot();
        vm.stopPrank();

        // Alice transfers after snapshot — her snapshot balance unchanged
        vm.prank(alice);
        token.transfer(bob, 40e18);

        assertEq(token.balanceOfAt(alice, snapId), 100e18);
        assertEq(token.balanceOf(alice), 60e18);
    }

    // ─── Snapshot ─────────────────────────────────────────────────────────────

    function test_TakeSnapshot_ByOwner() public {
        vm.prank(owner);
        uint256 snapId = token.takeSnapshot();
        assertEq(snapId, 1);
    }

    function test_TakeSnapshot_BySnapshotCaller() public {
        address caller = makeAddr("caller");
        vm.prank(owner);
        token.addSnapshotCaller(caller);

        vm.prank(caller);
        uint256 snapId = token.takeSnapshot();
        assertEq(snapId, 1);
    }

    function test_RevertWhen_TakeSnapshot_Unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(GovernanceToken.NotSnapshotCaller.selector, unauthorized));
        token.takeSnapshot();
    }

    function test_BalanceOfAt_SnapshotNotCurrentBalance() public {
        vm.startPrank(owner);
        token.mint(alice, 1000e18);
        uint256 snapId = token.takeSnapshot();
        token.mint(alice, 500e18);
        vm.stopPrank();

        assertEq(token.balanceOfAt(alice, snapId), 1000e18);
        assertEq(token.balanceOf(alice), 1500e18);
    }

    function test_TotalSupplyAt_SnapshotNotCurrent() public {
        vm.startPrank(owner);
        token.mint(alice, 1000e18);
        uint256 snapId = token.takeSnapshot();
        token.mint(bob, 200e18);
        vm.stopPrank();

        assertEq(token.totalSupplyAt(snapId), 1000e18);
        assertEq(token.totalSupply(), 1200e18);
    }

    function test_MultipleSnapshots_IndependentBalances() public {
        vm.startPrank(owner);
        token.mint(alice, 100e18);
        uint256 snap1 = token.takeSnapshot();
        token.mint(alice, 50e18);
        uint256 snap2 = token.takeSnapshot();
        vm.stopPrank();

        assertEq(token.balanceOfAt(alice, snap1), 100e18);
        assertEq(token.balanceOfAt(alice, snap2), 150e18);
    }

    // ─── Snapshot Caller Management ───────────────────────────────────────────

    function test_AddSnapshotCaller() public {
        address caller = makeAddr("caller");
        vm.prank(owner);
        token.addSnapshotCaller(caller);
        assertTrue(token.snapshotCallers(caller));
    }

    function test_RemoveSnapshotCaller() public {
        address caller = makeAddr("caller");
        vm.startPrank(owner);
        token.addSnapshotCaller(caller);
        token.removeSnapshotCaller(caller);
        vm.stopPrank();
        assertFalse(token.snapshotCallers(caller));
    }

    function test_RevertWhen_NonOwnerAddsSnapshotCaller() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        token.addSnapshotCaller(alice);
    }

    function test_RevertWhen_AddSnapshotCaller_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(GovernanceToken.ZeroAddress.selector);
        token.addSnapshotCaller(address(0));
    }

    // ─── Batch Mint ───────────────────────────────────────────────────────────

    function test_BatchMint_Success() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200e18;

        vm.prank(owner);
        token.batchMint(recipients, amounts);

        assertEq(token.balanceOf(alice), 100e18);
        assertEq(token.balanceOf(bob), 200e18);
    }

    function test_BatchMint_RevertWhen_ArrayLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e18;

        vm.prank(owner);
        vm.expectRevert(GovernanceToken.ArrayLengthMismatch.selector);
        token.batchMint(recipients, amounts);
    }
}
