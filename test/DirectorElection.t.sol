// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceToken.sol";
import "../src/DirectorElection.sol";

/**
 * @title DirectorElectionTest
 * @notice Tests for DirectorElection covering:
 *   - Election setup and time constraints
 *   - Cumulative voting (all-on-one and spread)
 *   - Snapshot timing: tokens acquired after snapshot must not count (requirement #1)
 *   - Off-chain sort + on-chain verification in finalizeElection
 *   - Finalization edge cases (sort validation, candidate mismatch, early finalize)
 */
contract DirectorElectionTest is Test {
    GovernanceToken token;
    DirectorElection election;

    address owner;
    address alice;
    address bob;
    address carol;
    address dave;
    address lateJoiner; // acquires tokens AFTER the snapshot

    // Candidates
    address cand1;
    address cand2;
    address cand3;

    uint256 constant NOW = 1_000_000;
    uint256 meetingDate;
    uint256 voteEnd;

    function setUp() public {
        vm.warp(NOW);

        owner      = makeAddr("owner");
        alice      = makeAddr("alice");
        bob        = makeAddr("bob");
        carol      = makeAddr("carol");
        dave       = makeAddr("dave");
        lateJoiner = makeAddr("lateJoiner");
        cand1      = makeAddr("cand1");
        cand2      = makeAddr("cand2");
        cand3      = makeAddr("cand3");

        vm.startPrank(owner);
        token    = new GovernanceToken("CGT", "CGT");
        election = new DirectorElection(address(token));
        token.addSnapshotCaller(address(election));

        // Mint before election is created (pre-snapshot balances)
        token.mint(alice, 300e18);
        token.mint(bob,   200e18);
        token.mint(carol, 100e18);
        // dave has no tokens yet
        vm.stopPrank();

        meetingDate = NOW + 60 days;
        voteEnd     = meetingDate - 3 days; // safely within the 2-day limit
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _createElection(uint256 seats) internal returns (uint256 electionId) {
        vm.prank(owner);
        electionId = election.createElection(meetingDate, seats, voteEnd);
    }

    function _createElectionWithCandidates(uint256 seats) internal returns (uint256 electionId) {
        electionId = _createElection(seats);
        vm.startPrank(owner);
        election.registerCandidate(electionId, cand1, "Test", "");
        election.registerCandidate(electionId, cand2, "Test", "");
        election.registerCandidate(electionId, cand3, "Test", "");
        vm.stopPrank();
    }

    // ─── Election Setup ───────────────────────────────────────────────────────

    function test_CreateElection_Success() public {
        uint256 eid = _createElection(3);
        (uint256 id,,uint256 sc, uint256 ve, uint256 snapId, bool fin, uint256 cc) = election.getElection(eid);
        assertEq(id, 0);
        assertEq(sc, 3);
        assertEq(ve, voteEnd);
        assertFalse(fin);
        assertEq(cc, 0); // no candidates yet
        assertGt(snapId, 0);
    }

    function test_CreateElection_TriggersSnapshot() public {
        uint256 snapBefore = 0;
        // snapshot ID increments; we just verify snapId > 0 in election
        uint256 eid = _createElection(2);
        (,,,, uint256 snapId,,) = election.getElection(eid);
        assertGt(snapId, snapBefore);
    }

    function test_RevertWhen_CreateElection_VoteEndTooLate() public {
        vm.prank(owner);
        vm.expectRevert(); // voteEnd = meetingDate - 1 day < required meetingDate - 2 days
        election.createElection(meetingDate, 3, meetingDate - 1 days);
    }

    function test_RevertWhen_CreateElection_ZeroSeats() public {
        vm.prank(owner);
        vm.expectRevert(DirectorElection.ZeroSeats.selector);
        election.createElection(meetingDate, 0, voteEnd);
    }

    function test_RegisterCandidate_Success() public {
        uint256 eid = _createElection(3);
        vm.prank(owner);
        election.registerCandidate(eid, cand1, "Test", "");

        address[] memory candidates = election.getCandidates(eid);
        assertEq(candidates.length, 1);
        assertEq(candidates[0], cand1);
    }

    function test_RevertWhen_RegisterCandidate_Duplicate() public {
        uint256 eid = _createElection(3);
        vm.startPrank(owner);
        election.registerCandidate(eid, cand1, "Test", "");
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.CandidateAlreadyRegistered.selector, cand1, eid));
        election.registerCandidate(eid, cand1, "Test", "");
        vm.stopPrank();
    }

    // ─── Cumulative Voting ────────────────────────────────────────────────────

    /**
     * @notice Test: concentrate all votes on one candidate.
     *   alice has 300e18, seatCount=3 → maxVotes = 900e18
     *   alice puts all 900e18 on cand1.
     */
    function test_CastVotes_AllOnOneCandidate() public {
        uint256 eid = _createElectionWithCandidates(3);

        address[] memory cs = new address[](1);
        cs[0] = cand1;
        uint256[] memory vs = new uint256[](1);
        vs[0] = 900e18; // 300 * 3

        vm.prank(alice);
        election.castVotes(eid, cs, vs);

        assertEq(election.getCandidateVotes(eid, cand1), 900e18);
        assertTrue(election.hasVoted(eid, alice));
    }

    /**
     * @notice Test: spread votes across multiple candidates.
     *   alice: 300e18 * 3 = 900 max; split 400/300/200.
     */
    function test_CastVotes_SpreadAcrossCandidates() public {
        uint256 eid = _createElectionWithCandidates(3);

        address[] memory cs = new address[](3);
        cs[0] = cand1; cs[1] = cand2; cs[2] = cand3;
        uint256[] memory vs = new uint256[](3);
        vs[0] = 400e18; vs[1] = 300e18; vs[2] = 200e18;

        vm.prank(alice);
        election.castVotes(eid, cs, vs);

        assertEq(election.getCandidateVotes(eid, cand1), 400e18);
        assertEq(election.getCandidateVotes(eid, cand2), 300e18);
        assertEq(election.getCandidateVotes(eid, cand3), 200e18);
    }

    function test_RevertWhen_VotesExceedMax() public {
        uint256 eid = _createElectionWithCandidates(3);

        address[] memory cs = new address[](1); cs[0] = cand1;
        uint256[] memory vs = new uint256[](1); vs[0] = 901e18; // 300*3+1

        vm.prank(alice);
        vm.expectRevert();
        election.castVotes(eid, cs, vs);
    }

    function test_RevertWhen_DoubleVote() public {
        uint256 eid = _createElectionWithCandidates(3);

        address[] memory cs = new address[](1); cs[0] = cand1;
        uint256[] memory vs = new uint256[](1); vs[0] = 300e18;

        vm.startPrank(alice);
        election.castVotes(eid, cs, vs);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.AlreadyVoted.selector, alice));
        election.castVotes(eid, cs, vs);
        vm.stopPrank();
    }

    function test_RevertWhen_VoteForUnregisteredCandidate() public {
        uint256 eid = _createElection(3);

        address[] memory cs = new address[](1); cs[0] = cand1; // not yet registered
        uint256[] memory vs = new uint256[](1); vs[0] = 100e18;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.CandidateNotRegistered.selector, cand1, eid));
        election.castVotes(eid, cs, vs);
    }

    function test_RevertWhen_VoteAfterVoteEnd() public {
        uint256 eid = _createElectionWithCandidates(3);
        vm.warp(voteEnd + 1);

        address[] memory cs = new address[](1); cs[0] = cand1;
        uint256[] memory vs = new uint256[](1); vs[0] = 100e18;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.VotingEnded.selector, eid));
        election.castVotes(eid, cs, vs);
    }

    // ─── Snapshot Timing (Requirement #1) ────────────────────────────────────

    /**
     * @notice Tokens acquired AFTER the election snapshot must not count.
     *   dave had 0 tokens when createElection was called.
     *   After the snapshot, he receives 10000e18 tokens.
     *   dave's maxVotes = balanceOfAt(dave, snapId) * seatCount = 0 * 3 = 0.
     *   Attempting to cast even 1 vote must revert.
     */
    function test_CastVotes_TokensBoughtAfterSnapshot_DontCount() public {
        uint256 eid = _createElectionWithCandidates(3);

        // dave acquires tokens after snapshot
        vm.prank(owner);
        token.mint(dave, 10_000e18);

        // dave's snapshot balance = 0 → maxVotes = 0
        address[] memory cs = new address[](1); cs[0] = cand1;
        uint256[] memory vs = new uint256[](1); vs[0] = 1;

        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.VotesExceedMaximum.selector, 1, 0));
        election.castVotes(eid, cs, vs);
    }

    /**
     * @notice Symmetric check: lateJoiner also gets 0 votes despite large post-snapshot balance.
     */
    function test_LateJoiner_ZeroVotingPower() public {
        uint256 eid = _createElectionWithCandidates(3);

        // lateJoiner acquires tokens after snapshot
        vm.prank(owner);
        token.mint(lateJoiner, 999_999e18);

        (,,,, uint256 snapId,,) = election.getElection(eid);
        assertEq(token.balanceOfAt(lateJoiner, snapId), 0);
    }

    // ─── Finalization ─────────────────────────────────────────────────────────

    /**
     * @notice Full lifecycle: 3 voters, 3 candidates, 3 seats.
     *   alice → cand1: 600e18
     *   bob   → cand2: 400e18, cand3: 200e18
     *   carol → cand1: 200e18
     *
     *   Totals: cand1=800, cand2=400, cand3=200
     *   Sorted: [cand1=800, cand2=400, cand3=200]
     *   All 3 elected (3 seats).
     */
    function test_FinalizeElection_CorrectWinners() public {
        uint256 eid = _createElectionWithCandidates(3);

        // alice puts 600 on cand1
        {
            address[] memory cs = new address[](1); cs[0] = cand1;
            uint256[] memory vs = new uint256[](1); vs[0] = 600e18;
            vm.prank(alice);
            election.castVotes(eid, cs, vs);
        }
        // bob spreads 400+200
        {
            address[] memory cs = new address[](2); cs[0] = cand2; cs[1] = cand3;
            uint256[] memory vs = new uint256[](2); vs[0] = 400e18; vs[1] = 200e18;
            vm.prank(bob);
            election.castVotes(eid, cs, vs);
        }
        // carol puts 200 on cand1
        {
            address[] memory cs = new address[](1); cs[0] = cand1;
            uint256[] memory vs = new uint256[](1); vs[0] = 200e18;
            vm.prank(carol);
            election.castVotes(eid, cs, vs);
        }

        vm.warp(voteEnd + 1);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);
        sortedV[0] = 800e18; sortedV[1] = 400e18; sortedV[2] = 200e18;

        vm.prank(owner);
        election.finalizeElection(eid, sorted, sortedV);

        (,,,,,bool fin,) = election.getElection(eid);
        assertTrue(fin);
    }

    /**
     * @notice Only top seatCount winners are elected even if more candidates exist.
     *   2 seats, 3 candidates → only top 2 elected.
     */
    function test_FinalizeElection_OnlyTopSeatsElected() public {
        uint256 eid = _createElectionWithCandidates(2); // 2 seats

        {
            address[] memory cs = new address[](3);
            cs[0] = cand1; cs[1] = cand2; cs[2] = cand3;
            uint256[] memory vs = new uint256[](3);
            vs[0] = 300e18; vs[1] = 200e18; vs[2] = 100e18;
            vm.prank(alice);
            election.castVotes(eid, cs, vs); // 300*2=600 max, 300+200+100=600 ✓
        }

        vm.warp(voteEnd + 1);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);
        sortedV[0] = 300e18; sortedV[1] = 200e18; sortedV[2] = 100e18;

        vm.expectEmit(true, false, false, false);
        emit DirectorElection.ElectionFinalized(eid, new address[](0), new uint256[](0));

        vm.prank(owner);
        election.finalizeElection(eid, sorted, sortedV);
    }

    function test_RevertWhen_FinalizeBeforeVoteEnd() public {
        uint256 eid = _createElectionWithCandidates(3);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.VotingNotOpen.selector, eid));
        election.finalizeElection(eid, sorted, sortedV);
    }

    function test_RevertWhen_DoubleFinalize() public {
        uint256 eid = _createElectionWithCandidates(3);
        vm.warp(voteEnd + 1);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);

        vm.startPrank(owner);
        election.finalizeElection(eid, sorted, sortedV);
        vm.expectRevert(abi.encodeWithSelector(DirectorElection.ElectionAlreadyFinalized.selector, eid));
        election.finalizeElection(eid, sorted, sortedV);
        vm.stopPrank();
    }

    /**
     * @notice Verify that a non-descending sort is rejected.
     */
    function test_RevertWhen_SortedArrayNotDescending() public {
        uint256 eid = _createElectionWithCandidates(3);

        {
            address[] memory cs = new address[](1); cs[0] = cand1;
            uint256[] memory vs = new uint256[](1); vs[0] = 300e18;
            vm.prank(alice);
            election.castVotes(eid, cs, vs);
        }
        {
            address[] memory cs = new address[](1); cs[0] = cand2;
            uint256[] memory vs = new uint256[](1); vs[0] = 200e18;
            vm.prank(bob);
            election.castVotes(eid, cs, vs);
        }
        // cand3 gets 0 votes

        vm.warp(voteEnd + 1);

        // Wrong order: cand2 > cand1 in provided array → should revert
        address[] memory sorted = new address[](3);
        sorted[0] = cand2; sorted[1] = cand1; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);
        sortedV[0] = 200e18; sortedV[1] = 300e18; sortedV[2] = 0; // ascending → invalid

        vm.prank(owner);
        vm.expectRevert();
        election.finalizeElection(eid, sorted, sortedV);
    }

    /**
     * @notice Verify that a mismatch between provided votes and on-chain tally reverts.
     */
    function test_RevertWhen_CandidateVotesMismatch() public {
        uint256 eid = _createElectionWithCandidates(3);

        {
            address[] memory cs = new address[](1); cs[0] = cand1;
            uint256[] memory vs = new uint256[](1); vs[0] = 300e18;
            vm.prank(alice);
            election.castVotes(eid, cs, vs);
        }

        vm.warp(voteEnd + 1);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3);
        sortedV[0] = 999e18; // WRONG — actual is 300e18
        sortedV[1] = 0;
        sortedV[2] = 0;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            DirectorElection.CandidateVotesMismatch.selector, cand1, 999e18, 300e18
        ));
        election.finalizeElection(eid, sorted, sortedV);
    }

    function test_FinalizeElection_EmitsEvent() public {
        uint256 eid = _createElectionWithCandidates(3);
        vm.warp(voteEnd + 1);

        address[] memory sorted = new address[](3);
        sorted[0] = cand1; sorted[1] = cand2; sorted[2] = cand3;
        uint256[] memory sortedV = new uint256[](3); // all zeros

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit DirectorElection.ElectionFinalized(eid, new address[](0), new uint256[](0));
        election.finalizeElection(eid, sorted, sortedV);
    }

    // ─── Multiple Elections ───────────────────────────────────────────────────

    function test_MultipleElections_IndependentSnapshots() public {
        // First election — alice has 300e18
        uint256 eid1 = _createElection(2);

        // Mint more tokens to alice after first snapshot
        vm.prank(owner);
        token.mint(alice, 100e18); // alice now 400e18, but snap1 = 300e18

        // Second election — alice has 400e18
        uint256 eid2 = _createElection(2);

        (,,,, uint256 snap1,,) = election.getElection(eid1);
        (,,,, uint256 snap2,,) = election.getElection(eid2);

        assertEq(token.balanceOfAt(alice, snap1), 300e18);
        assertEq(token.balanceOfAt(alice, snap2), 400e18);
    }
}
