// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./GovernanceToken.sol";

/**
 * @title DirectorElection
 * @notice Cumulative-voting board-of-directors election contract.
 *
 * Cumulative Voting
 * ─────────────────
 * Each shareholder receives (snapshot balance × seatCount) total votes.
 * These votes may be concentrated on a single candidate or spread across
 * multiple candidates in any combination, as long as the total does not
 * exceed the voter's maximum allocation.
 *
 * Off-chain Sort + On-chain Verification
 * ───────────────────────────────────────
 * To avoid expensive on-chain sort operations, tallying is done off-chain.
 * The owner submits the sorted results via finalizeElection, and the contract:
 *   1. Verifies that every candidate's provided vote count matches the stored tally.
 *   2. Verifies that the array is sorted in non-increasing order.
 *   3. Declares the top min(seatCount, candidates.length) addresses as elected.
 *
 * Snapshot Timing
 * ───────────────
 * A snapshot is taken when createElection is called. Tokens acquired after
 * the snapshot confer no voting power in that election.
 */
contract DirectorElection is Ownable, ReentrancyGuard {
    // ─── Custom Errors ────────────────────────────────────────────────────────

    error ElectionNotFound(uint256 electionId);
    error VoteEndTooLate(uint256 voteEnd, uint256 limit);
    error VoteEndInPast(uint256 voteEnd);
    error ElectionAlreadyFinalized(uint256 electionId);
    error VotingNotOpen(uint256 electionId);
    error VotingEnded(uint256 electionId);
    error AlreadyVoted(address voter);
    error VotesExceedMaximum(uint256 cast, uint256 maximum);
    error CandidateNotRegistered(address candidate, uint256 electionId);
    error CandidateAlreadyRegistered(address candidate, uint256 electionId);
    error ArrayLengthMismatch();
    error SortedArrayNotDescending(uint256 index, uint256 higher, uint256 lower);
    error CandidateVotesMismatch(address candidate, uint256 provided, uint256 actual);
    error ZeroSeats();
    error ZeroAddress();
    error CandidateArrayInvalid();

    // ─── Events ───────────────────────────────────────────────────────────────

    event ElectionCreated(uint256 indexed electionId, uint256 meetingDate, uint256 seatCount, uint256 voteEnd, uint256 snapshotId);
    event CandidateRegistered(uint256 indexed electionId, address indexed candidate);
    event VotesCast(uint256 indexed electionId, address indexed voter, uint256 totalVotesCast);
    event ElectionFinalized(uint256 indexed electionId, address[] electedDirectors, uint256[] votes);

    // ─── Types ────────────────────────────────────────────────────────────────

    /**
     * @dev Election state. Structs with nested mappings cannot be placed in dynamic
     *      arrays; we use mapping(uint256 => Election) instead.
     */
    struct Election {
        uint256 id;
        uint256 meetingDate;
        uint256 seatCount;
        uint256 voteEnd;
        uint256 snapshotId;
        bool finalized;
        address[] candidates;
        mapping(address => bool) isCandidateRegistered;
        mapping(address => uint256) candidateVotes;
        mapping(address => bool) hasVoted;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    GovernanceToken public immutable token;

    /// @notice Display name for each candidate address (cross-election).
    mapping(address => string) public candidateName;

    /// @notice Photo URL for each candidate address (cross-election).
    mapping(address => string) public candidatePhotoUrl;

    uint256 public nextElectionId;
    mapping(uint256 => Election) private _elections;

    /// @notice Admin-controlled time offset for demo/testing purposes.
    uint256 public timeOffset;

    function _now() internal view returns (uint256) { return block.timestamp + timeOffset; }
    function currentTime() external view returns (uint256) { return block.timestamp + timeOffset; }
    function addTimeOffset(uint256 secs) external onlyOwner { timeOffset += secs; }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param token_ Address of the deployed GovernanceToken contract.
     */
    constructor(address token_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = GovernanceToken(token_);
    }

    // ─── Election Setup ───────────────────────────────────────────────────────

    /**
     * @notice Create a new director election and capture a share snapshot.
     * @dev Requires this contract to be registered as a snapshot caller on GovernanceToken.
     * @param meetingDate Unix timestamp of the shareholders' meeting.
     * @param seatCount   Number of board seats to be filled.
     * @param voteEnd     Unix timestamp when electronic voting closes (must be ≤ meetingDate - 2 days).
     * @return electionId The newly assigned election ID.
     */
    function createElection(uint256 meetingDate, uint256 seatCount, uint256 voteEnd)
        external
        onlyOwner
        returns (uint256 electionId)
    {
        if (seatCount == 0) revert ZeroSeats();

        uint256 limit = meetingDate - 2 days;
        if (voteEnd > limit) revert VoteEndTooLate(voteEnd, limit);
        if (voteEnd <= _now()) revert VoteEndInPast(voteEnd);

        uint256 snapId = token.takeSnapshot();

        electionId = nextElectionId++;
        Election storage e = _elections[electionId];
        e.id = electionId;
        e.meetingDate = meetingDate;
        e.seatCount = seatCount;
        e.voteEnd = voteEnd;
        e.snapshotId = snapId;

        emit ElectionCreated(electionId, meetingDate, seatCount, voteEnd, snapId);
    }

    function registerCandidate(
        uint256 electionId,
        address candidate,
        string calldata name,
        string calldata photoUrl
    ) external onlyOwner {
        if (candidate == address(0)) revert ZeroAddress();
        Election storage e = _requireElection(electionId);
        if (e.finalized) revert ElectionAlreadyFinalized(electionId);
        if (e.isCandidateRegistered[candidate]) revert CandidateAlreadyRegistered(candidate, electionId);

        e.isCandidateRegistered[candidate] = true;
        e.candidates.push(candidate);
        candidateName[candidate]    = name;
        candidatePhotoUrl[candidate] = photoUrl;

        emit CandidateRegistered(electionId, candidate);
    }

    /// @notice Update a candidate's display info without re-registering.
    function setCandidateInfo(address candidate, string calldata name, string calldata photoUrl)
        external onlyOwner
    {
        candidateName[candidate]    = name;
        candidatePhotoUrl[candidate] = photoUrl;
    }

    /// @notice Remove a candidate from an election (only before finalization).
    function removeCandidate(uint256 electionId, address candidate) external onlyOwner {
        Election storage e = _requireElection(electionId);
        if (e.finalized) revert ElectionAlreadyFinalized(electionId);
        if (!e.isCandidateRegistered[candidate]) revert CandidateNotRegistered(candidate, electionId);

        e.isCandidateRegistered[candidate] = false;

        uint256 len = e.candidates.length;
        for (uint256 i = 0; i < len; ) {
            if (e.candidates[i] == candidate) {
                e.candidates[i] = e.candidates[len - 1];
                e.candidates.pop();
                break;
            }
            unchecked { ++i; }
        }
    }

    // ─── Voting ───────────────────────────────────────────────────────────────

    /**
     * @notice Cast cumulative votes across one or more candidates.
     *         Maximum votes = balanceOfAt(voter, snapshotId) × seatCount.
     *         Votes may be concentrated on one candidate or spread freely.
     * @param electionId  The election to vote in.
     * @param candidates_ Candidate addresses to receive votes.
     * @param votes_      Corresponding vote amounts (must sum ≤ maxVotes).
     */
    function castVotes(
        uint256 electionId,
        address[] calldata candidates_,
        uint256[] calldata votes_
    ) external nonReentrant {
        if (candidates_.length != votes_.length) revert ArrayLengthMismatch();
        if (candidates_.length == 0) revert CandidateArrayInvalid();

        Election storage e = _requireElection(electionId);
        if (_now() > e.voteEnd) revert VotingEnded(electionId);
        if (e.hasVoted[msg.sender]) revert AlreadyVoted(msg.sender);

        uint256 snapBal = token.balanceOfAt(msg.sender, e.snapshotId);
        uint256 maxVotes = snapBal * e.seatCount;

        uint256 totalCast;
        for (uint256 i = 0; i < candidates_.length; ) {
            if (!e.isCandidateRegistered[candidates_[i]]) {
                revert CandidateNotRegistered(candidates_[i], electionId);
            }
            totalCast += votes_[i];
            unchecked { ++i; }
        }
        if (totalCast > maxVotes) revert VotesExceedMaximum(totalCast, maxVotes);

        for (uint256 i = 0; i < candidates_.length; ) {
            e.candidateVotes[candidates_[i]] += votes_[i];
            unchecked { ++i; }
        }
        e.hasVoted[msg.sender] = true;

        emit VotesCast(electionId, msg.sender, totalCast);
    }

    // ─── Finalization ─────────────────────────────────────────────────────────

    /**
     * @notice Finalize the election using an off-chain sorted result.
     *         The contract verifies:
     *           1. Every candidate's provided vote count matches the on-chain tally.
     *           2. sortedVotes is in non-increasing order (ties allowed).
     *           3. The first min(seatCount, len) addresses are declared elected.
     * @param electionId        The election to finalize.
     * @param sortedCandidates  All registered candidates, sorted by votes descending.
     * @param sortedVotes       Corresponding vote totals (must match on-chain tallies).
     */
    function finalizeElection(
        uint256 electionId,
        address[] calldata sortedCandidates,
        uint256[] calldata sortedVotes
    ) external onlyOwner nonReentrant {
        if (sortedCandidates.length != sortedVotes.length) revert ArrayLengthMismatch();

        Election storage e = _requireElection(electionId);
        if (_now() <= e.voteEnd) revert VotingNotOpen(electionId);
        if (e.finalized) revert ElectionAlreadyFinalized(electionId);

        // Verify all candidates in the sorted list are registered and the full list is provided
        if (sortedCandidates.length != e.candidates.length) revert ArrayLengthMismatch();

        // Validate vote counts and sort order
        for (uint256 i = 0; i < sortedCandidates.length; ) {
            address c = sortedCandidates[i];
            if (!e.isCandidateRegistered[c]) revert CandidateNotRegistered(c, electionId);

            uint256 expected = e.candidateVotes[c];
            if (sortedVotes[i] != expected) {
                revert CandidateVotesMismatch(c, sortedVotes[i], expected);
            }
            // Verify descending order (ties are allowed: >= is correct)
            if (i > 0 && sortedVotes[i] > sortedVotes[i - 1]) {
                revert SortedArrayNotDescending(i, sortedVotes[i - 1], sortedVotes[i]);
            }
            unchecked { ++i; }
        }

        // Elect top min(seatCount, candidates.length) candidates
        uint256 elected = sortedCandidates.length < e.seatCount
            ? sortedCandidates.length
            : e.seatCount;

        address[] memory electedDirectors = new address[](elected);
        uint256[] memory electedVotes = new uint256[](elected);
        for (uint256 i = 0; i < elected; ) {
            electedDirectors[i] = sortedCandidates[i];
            electedVotes[i] = sortedVotes[i];
            unchecked { ++i; }
        }

        e.finalized = true;

        emit ElectionFinalized(electionId, electedDirectors, electedVotes);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Return the scalar fields of an election (excludes nested mappings).
     */
    function getElection(uint256 electionId)
        external
        view
        returns (
            uint256 id,
            uint256 meetingDate,
            uint256 seatCount,
            uint256 voteEnd,
            uint256 snapshotId,
            bool finalized,
            uint256 candidateCount
        )
    {
        Election storage e = _requireElection(electionId);
        return (e.id, e.meetingDate, e.seatCount, e.voteEnd, e.snapshotId, e.finalized, e.candidates.length);
    }

    /**
     * @notice Return the list of registered candidates for an election.
     */
    function getCandidates(uint256 electionId) external view returns (address[] memory) {
        return _requireElection(electionId).candidates;
    }

    /**
     * @notice Return the on-chain vote tally for a specific candidate.
     */
    function getCandidateVotes(uint256 electionId, address candidate) external view returns (uint256) {
        return _requireElection(electionId).candidateVotes[candidate];
    }

    /**
     * @notice Check whether a voter has already cast votes in an election.
     */
    function hasVoted(uint256 electionId, address voter) external view returns (bool) {
        return _requireElection(electionId).hasVoted[voter];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _requireElection(uint256 electionId) internal view returns (Election storage) {
        if (electionId >= nextElectionId) revert ElectionNotFound(electionId);
        return _elections[electionId];
    }
}
