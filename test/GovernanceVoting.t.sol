// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceToken.sol";
import "../src/GovernanceVoting.sol";

/**
 * Timeline (annual + general company, all relative to meetingDate):
 *   -50d  openProposingPhase
 *   -30d  proposingDeadline     = votingStartDeadline - 10d (last moment to submit proposals)
 *   -20d  votingStartDeadline   (latest allowed call to startVoting)
 *   - 2d  latest voteEnd
 *     0   meeting
 *
 * In tests: NOW = 1_000_000, meetingDate = NOW + 60 days
 *   proposingDeadline    = meetingDate - 30d = NOW + 30d
 *   votingStartDeadline  = meetingDate - 20d = NOW + 40d
 *   startVoting window: [NOW+30d, NOW+40d]
 */
contract GovernanceVotingTest is Test {
    GovernanceToken token;
    GovernanceVoting voting;

    address owner;
    address alice;
    address bob;
    address carol;
    address dave;
    address proxyAddr;

    uint256 constant NOW = 1_000_000;
    uint256 meetingDate;
    uint256 pDeadline; // proposingDeadline = meetingDate - 30 days (annual + general)

    function setUp() public {
        vm.warp(NOW);

        owner     = makeAddr("owner");
        alice     = makeAddr("alice");
        bob       = makeAddr("bob");
        carol     = makeAddr("carol");
        dave      = makeAddr("dave");
        proxyAddr = makeAddr("proxyAddr");

        vm.startPrank(owner);
        token  = new GovernanceToken("CGT", "CGT");
        voting = new GovernanceVoting(address(token));
        token.addSnapshotCaller(address(voting));
        // totalSupply = 700e18
        token.mint(alice, 400e18);
        token.mint(bob,   200e18);
        token.mint(carol, 100e18);
        vm.stopPrank();

        meetingDate = NOW + 60 days;
        pDeadline   = meetingDate - 30 days; // NOW + 30 days (votingStartDeadline - 10d = meetingDate - 20d - 10d)
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _openProposing() internal {
        vm.prank(owner);
        voting.openProposingPhase(meetingDate, false, false); // annual, general company
    }

    /// Open → create proposal → warp past proposingDeadline → startVoting.
    function _fullSetup() internal returns (uint256 proposalId) {
        _openProposing();
        vm.prank(alice);
        proposalId = voting.createProposal("Standard resolution", GovernanceVoting.ProposalType.Ordinary);
        // Board can only call startVoting after proposingDeadline
        vm.warp(pDeadline + 1);
        vm.prank(owner);
        voting.startVoting(proposalId, meetingDate - 2 days - 1);
    }

    // ─── Phase Enforcement ────────────────────────────────────────────────────

    function test_OpenProposingPhase_BeforeDeadline_Succeeds() public {
        // Called at NOW (= pDeadline - 20d), well before proposingDeadline
        _openProposing();
        assertEq(uint8(voting.currentPhase()), uint8(GovernanceVoting.Phase.Proposing));
        assertEq(voting.proposingDeadline(), pDeadline);
    }

    function test_RevertWhen_OpenProposingPhase_AfterDeadline() public {
        vm.warp(pDeadline); // exactly at deadline → should revert
        vm.prank(owner);
        vm.expectRevert();
        voting.openProposingPhase(meetingDate, false, false);
    }

    function test_RevertWhen_OpenProposingPhase_CannotReopen() public {
        _openProposing();
        vm.prank(owner);
        vm.expectRevert();
        voting.openProposingPhase(meetingDate + 60 days, false, false);
    }

    function test_RevertWhen_StartVoting_BeforeProposingDeadline() public {
        _openProposing();
        vm.prank(alice);
        uint256 pid = voting.createProposal("test", GovernanceVoting.ProposalType.Ordinary);

        // Still before proposingDeadline — board must wait
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.ProposingStillOpen.selector, pDeadline));
        voting.startVoting(pid, meetingDate - 2 days - 1);
    }

    function test_RevertWhen_StartVoting_VoteEndTooLate() public {
        _openProposing();
        vm.prank(alice);
        uint256 pid = voting.createProposal("test", GovernanceVoting.ProposalType.Ordinary);

        vm.warp(pDeadline + 1);
        vm.prank(owner);
        vm.expectRevert();
        voting.startVoting(pid, meetingDate - 1 days); // inside 2-day buffer
    }

    function test_StartVoting_ExactlyAtVoteEndLimit() public {
        _openProposing();
        vm.prank(alice);
        uint256 pid = voting.createProposal("test", GovernanceVoting.ProposalType.Ordinary);

        vm.warp(pDeadline + 1);
        uint256 limit = meetingDate - 2 days;
        vm.prank(owner);
        voting.startVoting(pid, limit);
        assertEq(voting.getProposalVoteEnd(pid), limit);
    }

    function test_RevertWhen_CreateProposal_OutsideProposingPhase() public {
        vm.prank(alice);
        vm.expectRevert();
        voting.createProposal("test", GovernanceVoting.ProposalType.Ordinary);
    }

    function test_RevertWhen_CreateProposal_AfterProposingDeadline() public {
        _openProposing();
        vm.warp(pDeadline); // at or past deadline
        vm.prank(alice);
        vm.expectRevert(GovernanceVoting.ProposingDeadlinePassed.selector);
        voting.createProposal("too late", GovernanceVoting.ProposalType.Ordinary);
    }

    // ─── Proposal Creation ────────────────────────────────────────────────────

    function test_CreateProposal_Success() public {
        _openProposing();
        vm.prank(alice);
        uint256 pid = voting.createProposal("A valid proposal", GovernanceVoting.ProposalType.Ordinary);
        assertEq(pid, 0);
    }

    function test_RevertWhen_DescriptionTooLong() public {
        _openProposing();
        bytes memory b = new bytes(901);
        for (uint256 i = 0; i < 901; i++) b[i] = "A";
        vm.prank(alice);
        vm.expectRevert();
        voting.createProposal(string(b), GovernanceVoting.ProposalType.Ordinary);
    }

    function test_CreateProposal_DescriptionExactly900Bytes_Succeeds() public {
        _openProposing();
        bytes memory b = new bytes(900);
        for (uint256 i = 0; i < 900; i++) b[i] = "A";
        vm.prank(alice);
        voting.createProposal(string(b), GovernanceVoting.ProposalType.Ordinary);
    }

    function test_CreateProposal_ExactlyAt1Percent() public {
        // total=100e18, dave=1e18 → 1e18*100 = 100e18 >= 100e18 ✓
        vm.startPrank(owner);
        GovernanceToken t2 = new GovernanceToken("T2", "T2");
        GovernanceVoting v2 = new GovernanceVoting(address(t2));
        t2.addSnapshotCaller(address(v2));
        address bigHolder = makeAddr("bigHolder");
        t2.mint(bigHolder, 99e18);
        t2.mint(dave, 1e18);
        vm.stopPrank();

        uint256 md = block.timestamp + 50 days;
        vm.prank(owner);
        v2.openProposingPhase(md, false, false);

        vm.prank(dave);
        uint256 pid = v2.createProposal("boundary", GovernanceVoting.ProposalType.Ordinary);
        assertEq(pid, 0);
    }

    function test_RevertWhen_CreateProposal_BelowThreshold() public {
        // total=100e18+1, dave=1e18 → 1e18*100=100e18 < 100e18+1 → revert
        vm.startPrank(owner);
        GovernanceToken t2 = new GovernanceToken("T2", "T2");
        GovernanceVoting v2 = new GovernanceVoting(address(t2));
        t2.addSnapshotCaller(address(v2));
        address bigHolder = makeAddr("bigHolder2");
        t2.mint(bigHolder, 99e18 + 1);
        t2.mint(dave, 1e18);
        vm.stopPrank();

        uint256 md = block.timestamp + 50 days;
        vm.prank(owner);
        v2.openProposingPhase(md, false, false);

        vm.prank(dave);
        vm.expectRevert();
        v2.createProposal("below threshold", GovernanceVoting.ProposalType.Ordinary);
    }

    function test_RevertWhen_CreateProposal_DuplicatePerMeeting() public {
        _openProposing();
        vm.startPrank(alice);
        voting.createProposal("first", GovernanceVoting.ProposalType.Ordinary);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.AlreadyProposedAtMeeting.selector, alice));
        voting.createProposal("second", GovernanceVoting.ProposalType.Ordinary);
        vm.stopPrank();
    }

    // ─── Cosign Flow ──────────────────────────────────────────────────────────

    function test_CreateCosignProposal_InitiatorIsCosigner1() public {
        _openProposing();
        vm.prank(carol);
        uint256 pid = voting.createCosignProposal("cosign prop", GovernanceVoting.ProposalType.Ordinary);

        (uint256 deadline, uint256 count, bool active) = voting.getProposalCosignInfo(pid);
        assertEq(count, 1);
        assertFalse(active);
        assertEq(deadline, pDeadline); // cosignDeadline == proposingDeadline
    }

    function test_ProposalActivated_At10Cosigners() public {
        _openProposing();
        vm.prank(carol);
        uint256 pid = voting.createCosignProposal("proposal", GovernanceVoting.ProposalType.Ordinary);

        address[] memory signers = new address[](9);
        for (uint256 i = 0; i < 9; i++) {
            signers[i] = makeAddr(string(abi.encodePacked("cosigner", i)));
        }

        for (uint256 i = 0; i < 8; i++) {
            vm.prank(signers[i]);
            voting.cosign(pid);
        }
        (, uint256 cnt1, bool active1) = voting.getProposalCosignInfo(pid);
        assertEq(cnt1, 9);
        assertFalse(active1);

        vm.prank(signers[8]);
        voting.cosign(pid);
        (, uint256 cnt2, bool active2) = voting.getProposalCosignInfo(pid);
        assertEq(cnt2, 10);
        assertTrue(active2);
    }

    function test_RevertWhen_CosignAfterDeadline() public {
        _openProposing();
        vm.prank(carol);
        uint256 pid = voting.createCosignProposal("proposal", GovernanceVoting.ProposalType.Ordinary);

        vm.warp(pDeadline); // at proposingDeadline → cosignDeadline passed
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.CosignDeadlinePassed.selector, pid));
        voting.cosign(pid);
    }

    function test_RevertWhen_DoubleCosign() public {
        _openProposing();
        vm.prank(carol);
        uint256 pid = voting.createCosignProposal("proposal", GovernanceVoting.ProposalType.Ordinary);

        vm.prank(bob);
        voting.cosign(pid);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.AlreadyCosigned.selector, bob));
        voting.cosign(pid);
    }

    // ─── Voting (no attendance required) ─────────────────────────────────────

    function test_Vote_Success() public {
        uint256 pid = _fullSetup();
        vm.prank(alice);
        voting.vote(400e18, 0, 0, pid);
        assertTrue(voting.hasVoted(pid, alice));
    }

    function test_RevertWhen_VotesExceedBalance() public {
        uint256 pid = _fullSetup();
        vm.prank(alice);
        vm.expectRevert();
        voting.vote(401e18, 0, 0, pid); // exceeds alice's 400e18
    }

    function test_RevertWhen_DoubleVote() public {
        uint256 pid = _fullSetup();
        vm.prank(alice);
        voting.vote(100e18, 0, 0, pid);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.AlreadyVoted.selector, alice));
        voting.vote(100e18, 0, 0, pid);
    }

    // ─── Resolution Threshold (forVotes * 2 > totalSupply) ───────────────────

    /**
     * Shared helper: fresh contracts, full flow, return VoteResult.
     * totalSupply = 700e18 (alice=400, bob=200, carol=100)
     */
    function _runVote(
        GovernanceVoting.ProposalType pType,
        address[] memory voters,
        uint256[] memory forVotes_,
        uint256[] memory againstVotes_
    ) internal returns (GovernanceVoting.VoteResult) {
        vm.warp(NOW);
        vm.startPrank(owner);
        GovernanceToken t = new GovernanceToken("T", "T");
        GovernanceVoting v = new GovernanceVoting(address(t));
        t.addSnapshotCaller(address(v));
        t.mint(alice, 400e18); t.mint(bob, 200e18); t.mint(carol, 100e18);
        vm.stopPrank();

        uint256 md  = NOW + 60 days;
        uint256 pDl = md - 30 days; // NOW + 30 days (annual + general)

        vm.prank(owner);
        v.openProposingPhase(md, false, false);

        vm.prank(alice);
        uint256 pid = v.createProposal("vote test", pType);

        vm.warp(pDl + 1);
        uint256 vEnd = md - 2 days - 1;
        vm.prank(owner);
        v.startVoting(pid, vEnd);

        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            v.vote(forVotes_[i], againstVotes_[i], 0, pid);
        }

        vm.warp(vEnd + 1);
        v.finalizeProposal(pid);

        (bool fin, GovernanceVoting.VoteResult res) = v.getProposalFinalized(pid);
        assertTrue(fin);
        return res;
    }

    // forVotes = 400e18, totalSupply = 700e18 → 400*2=800 > 700 ✓
    function test_Resolution_Passes() public {
        address[] memory v = new address[](1); v[0] = alice;
        uint256[] memory f = new uint256[](1); f[0] = 400e18;
        uint256[] memory a = new uint256[](1); a[0] = 0;
        assertEq(uint8(_runVote(GovernanceVoting.ProposalType.Ordinary, v, f, a)),
                 uint8(GovernanceVoting.VoteResult.Passed));
    }

    // forVotes = 350e18 (exactly half) → 350*2=700, NOT > 700 → FAIL
    // forVotes=300, totalVotes=600 → 300*2=600 NOT > 600 → FAIL (needs strict majority)
    function test_Resolution_Fails_ExactlyHalf() public {
        address[] memory v = new address[](2); v[0] = alice; v[1] = bob;
        uint256[] memory f = new uint256[](2); f[0] = 200e18; f[1] = 100e18; // sum=300
        uint256[] memory a = new uint256[](2); a[0] = 200e18; a[1] = 100e18; // sum=300
        assertEq(uint8(_runVote(GovernanceVoting.ProposalType.Ordinary, v, f, a)),
                 uint8(GovernanceVoting.VoteResult.Failed));
    }

    // forVotes = 351e18 → 351*2=702 > 700 ✓
    function test_Resolution_Passes_OneOverHalf() public {
        address[] memory v = new address[](2); v[0] = alice; v[1] = bob;
        uint256[] memory f = new uint256[](2); f[0] = 200e18; f[1] = 151e18;
        uint256[] memory a = new uint256[](2); a[0] = 200e18; a[1] = 49e18;
        assertEq(uint8(_runVote(GovernanceVoting.ProposalType.Ordinary, v, f, a)),
                 uint8(GovernanceVoting.VoteResult.Passed));
    }

    // No votes cast → forVotes=0, 0*2=0 NOT > 700 → FAIL
    function test_Resolution_Fails_NoVotes() public {
        address[] memory v = new address[](0);
        uint256[] memory f = new uint256[](0);
        uint256[] memory a = new uint256[](0);
        assertEq(uint8(_runVote(GovernanceVoting.ProposalType.Ordinary, v, f, a)),
                 uint8(GovernanceVoting.VoteResult.Failed));
    }

    // Same rule applies to Special type
    function test_Resolution_Special_Passes() public {
        address[] memory v = new address[](1); v[0] = alice;
        uint256[] memory f = new uint256[](1); f[0] = 400e18;
        uint256[] memory a = new uint256[](1); a[0] = 0;
        assertEq(uint8(_runVote(GovernanceVoting.ProposalType.Special, v, f, a)),
                 uint8(GovernanceVoting.VoteResult.Passed));
    }

    // ─── Proxy Voting ─────────────────────────────────────────────────────────

    function test_GrantProxy_Success() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        assertEq(voting.proxyOf(pid, bob), proxyAddr);
    }

    function test_RevertWhen_VoteAfterGrantingProxy() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GovernanceVoting.AlreadyGrantedProxy.selector, bob));
        voting.vote(200e18, 0, 0, pid);
    }

    function test_VoteOnBehalf_Success() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(proxyAddr);
        voting.voteOnBehalf(pid, bob, 200e18, 0, 0);
        assertTrue(voting.proxyHasVoted(pid, bob));
    }

    function test_RevokeProxy_BeforeVote_Success() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(bob);
        voting.revokeProxy(pid);
        assertEq(voting.proxyOf(pid, bob), address(0));
    }

    function test_AfterRevokeProxy_DelegatorCanVoteDirectly() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(bob);
        voting.revokeProxy(pid);
        vm.prank(bob);
        voting.vote(200e18, 0, 0, pid);
        assertTrue(voting.hasVoted(pid, bob));
    }

    function test_RevertWhen_RevokeProxy_AfterProxyVoted() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(proxyAddr);
        voting.voteOnBehalf(pid, bob, 200e18, 0, 0);
        vm.prank(bob);
        vm.expectRevert(GovernanceVoting.CannotRevokeAfterProxyVoted.selector);
        voting.revokeProxy(pid);
    }

    function test_RevertWhen_ProxyVoteAfterRevoke() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(bob);
        voting.revokeProxy(pid);
        vm.prank(proxyAddr);
        vm.expectRevert();
        voting.voteOnBehalf(pid, bob, 200e18, 0, 0);
    }

    function test_RevertWhen_NonProxyCallsVoteOnBehalf() public {
        uint256 pid = _fullSetup();
        vm.prank(bob);
        voting.grantProxy(pid, proxyAddr);
        vm.prank(carol);
        vm.expectRevert();
        voting.voteOnBehalf(pid, bob, 200e18, 0, 0);
    }

    // ─── Extraordinary Meeting (臨時會 + 一般公司, 10-day deadline) ───────────

    function test_ExtraordinaryGeneral_ProposingDeadline() public {
        // 臨時會 + 一般公司: votingStartDeadline = meetingDate - 10d
        //                    proposingDeadline   = meetingDate - 20d
        uint256 md = NOW + 30 days;
        vm.prank(owner);
        voting.openProposingPhase(md, false, true); // isExtraordinary = true
        assertEq(voting.proposingDeadline(), md - 20 days);
        assertEq(voting.votingStartDeadline(), md - 10 days);
    }

    function test_ExtraordinaryGeneral_StartVoting_InWindow() public {
        uint256 md = NOW + 30 days;
        vm.prank(owner);
        voting.openProposingPhase(md, false, true);

        vm.prank(alice);
        uint256 pid = voting.createProposal("extraordinary test", GovernanceVoting.ProposalType.Ordinary);

        // Warp to after proposingDeadline (md-20d) and before votingStartDeadline (md-10d)
        vm.warp(md - 15 days);
        vm.prank(owner);
        voting.startVoting(pid, md - 2 days);
        assertEq(voting.getProposalVoteEnd(pid), md - 2 days);
    }

    // votingStartDeadline check removed — startVoting allowed any time after proposingDeadline

    // ─── Cosign Collective 1% Check ───────────────────────────────────────────

    function test_RevertWhen_CosignActivation_CollectiveBelowThreshold() public {
        // All cosigners have 0 balance → collective = 0 < 1% of 700e18
        _openProposing();
        // carol has 100e18 BUT we use fresh zero-balance addresses as initiator + cosigners
        address initiator = makeAddr("zeroInitiator");
        vm.prank(initiator);
        uint256 pid = voting.createCosignProposal("no-balance prop", GovernanceVoting.ProposalType.Ordinary);

        for (uint256 i = 0; i < 9; i++) {
            address signer = makeAddr(string(abi.encodePacked("zeroCosigner", i)));
            vm.prank(signer);
            // The 10th cosign triggers the check; expect revert on the 9th additional (total = 10)
            if (i < 8) {
                voting.cosign(pid);
            } else {
                vm.expectRevert(); // CollectiveBalanceBelowThreshold
                voting.cosign(pid);
            }
        }
    }

    // ─── Finalization ─────────────────────────────────────────────────────────

    function test_FinalizeProposal_Passes() public {
        uint256 pid = _fullSetup();
        uint256 vEnd = voting.getProposalVoteEnd(pid);

        // alice votes 400e18 for → 400*2=800 > 700 → Passed
        vm.prank(alice);
        voting.vote(400e18, 0, 0, pid);

        vm.warp(vEnd + 1);
        voting.finalizeProposal(pid);

        (bool finalized, GovernanceVoting.VoteResult result) = voting.getProposalFinalized(pid);
        assertTrue(finalized);
        assertEq(uint8(result), uint8(GovernanceVoting.VoteResult.Passed));
    }

    function test_RevertWhen_FinalizeBeforeVoteEnd() public {
        uint256 pid = _fullSetup();
        vm.expectRevert();
        voting.finalizeProposal(pid);
    }

    function test_RevertWhen_DoubleFinalize() public {
        uint256 pid = _fullSetup();
        vm.warp(voting.getProposalVoteEnd(pid) + 1);
        voting.finalizeProposal(pid);
        vm.expectRevert();
        voting.finalizeProposal(pid);
    }
}
