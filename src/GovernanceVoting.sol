// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceToken.sol";

/**
 * @title GovernanceVoting
 * @notice Corporate governance proposal and voting contract.
 *
 * Lifecycle
 * ─────────
 * 1. Owner calls openProposingPhase(meetingDate, isPublicCompany).
 *    - Enforces the statutory notice period (30 days public / 20 days general).
 *    - Takes a baseline snapshot of share balances.
 * 2. KYC shareholders submit proposals (createProposal) or initiate cosign proposals
 *    (createCosignProposal + cosign until 10 signatures are gathered).
 * 3. Owner calls startVoting(proposalId, voteEnd) for each proposal ready to go to vote.
 *    - Electronic voting must close at least 2 days before the meeting.
 *    - Takes a per-proposal snapshot at this moment.
 * 4. Shareholders attend(proposalId) and vote(…, proposalId).
 *    Alternatively a shareholder may grantProxy(proposalId, proxy) to delegate
 *    their vote to another address.
 * 5. After voteEnd, anyone may call finalizeProposal(proposalId) to compute and
 *    store the resolution outcome.
 *
 * Resolution Thresholds (integer arithmetic, no floating point)
 * ─────────────────────────────────────────────────────────────
 *   Ordinary     : attendedShares*2 > totalSupply  AND  forVotes*2 > attendedShares
 *   Special      : attendedShares*3 >= totalSupply*2  AND  forVotes*2 > attendedShares
 *   PublicSpecial: attendedShares*2 >= totalSupply  AND  forVotes*3 >= attendedShares*2
 */
contract GovernanceVoting is Ownable, ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────────────

    /// @notice Overall meeting lifecycle phase.
    enum Phase { NotStarted, Proposing, Voting, Closed }

    /**
     * @notice Proposal classification governs the applicable resolution threshold.
     *         AmendCharter and Dissolve use the Special threshold and MUST be filed
     *         during the proposing phase (no emergency motions).
     */
    enum ProposalType { Ordinary, Special, AmendCharter, Dissolve, PublicSpecial }

    /// @notice Final resolution result stored after finalizeProposal.
    enum VoteResult { Pending, Passed, Failed }

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        ProposalType pType;
        uint256 snapshotId;
        uint256 voteEnd;
        uint256 meetingDate;
        uint256 totalSupplyAtSnapshot;
        // Vote tallies
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        /// @dev Sum of snapshot balances of all attendees (including proxy-granted shares).
        uint256 attendedShares;
        // Cosign metadata (only used when isCosignProposal == true)
        bool isCosignProposal;
        uint256 cosignDeadline;
        uint256 cosignerCount;
        /// @dev true once the proposal may be voted on (always true for regular proposals;
        ///      for cosign proposals, true only after the 10th signature).
        bool isActive;
        bool votingStarted;
        bool finalized;
        VoteResult result;
    }

    // ─── Custom Errors ────────────────────────────────────────────────────────

    error InvalidPhase(Phase current);
    error MeetingTooSoon(uint256 timestamp, uint256 requiredBefore);
    error VoteEndTooLate(uint256 voteEnd, uint256 limit);
    error DescriptionTooLong(uint256 length);
    error InsufficientTokensToPropose(uint256 balance, uint256 required);
    error AlreadyProposedAtMeeting(address proposer);
    error ProposalNotFound(uint256 proposalId);
    error VotingNotStarted(uint256 proposalId);
    error VotingEnded(uint256 proposalId);
    error AlreadyAttended(address voter);
    error NotAttended(address voter);
    error AlreadyVoted(address voter);
    error VotesExceedBalance(uint256 cast, uint256 available);
    error CosignDeadlinePassed(uint256 proposalId);
    error AlreadyCosigned(address cosigner);
    error NotACosignProposal(uint256 proposalId);
    error ProposalNotActive(uint256 proposalId);
    error ProxyAlreadyGranted(address delegator);
    error ProxyAlreadyVoted(uint256 proposalId, address delegator);
    error NotAProxy(address caller, address delegator, uint256 proposalId);
    error DelegatorDisqualified(address delegator);
    error CannotRevokeAfterProxyVoted();
    error VotingAlreadyStarted(uint256 proposalId);
    error ProposalAlreadyFinalized(uint256 proposalId);
    error ZeroAddress();

    // ─── Events ───────────────────────────────────────────────────────────────

    event MeetingOpened(uint256 indexed meetingDate, bool isPublicCompany, uint256 snapshotId);
    event VotingStarted(uint256 indexed proposalId, uint256 voteEnd, uint256 snapshotId);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, ProposalType pType);
    event CosignProposalCreated(uint256 indexed proposalId, address indexed initiator, ProposalType pType, uint256 cosignDeadline);
    event ProposalCosigned(uint256 indexed proposalId, address indexed cosigner, uint256 cosignerCount);
    event ProposalActivatedByCosign(uint256 indexed proposalId);
    event Attended(uint256 indexed proposalId, address indexed voter, uint256 snapshotBalance);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes);
    event ProxyGranted(uint256 indexed proposalId, address indexed delegator, address indexed proxy);
    event ProxyRevoked(uint256 indexed proposalId, address indexed delegator);
    event VoteCastOnBehalf(uint256 indexed proposalId, address indexed proxy, address indexed delegator, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes);
    event ProposalFinalized(uint256 indexed proposalId, VoteResult result, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 attendedShares);

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The governance token contract this voting contract reads balances from.
    GovernanceToken public immutable token;

    uint256 public currentMeetingDate;
    bool public isPublicCompany;
    Phase public currentPhase;
    /// @notice Snapshot taken when the proposing phase opens (baseline).
    uint256 public meetingSnapshotId;

    uint256 public nextProposalId;
    mapping(uint256 => Proposal) public proposals;

    /// @dev proposer => meetingDate => has already submitted a proposal this meeting
    mapping(address => mapping(uint256 => bool)) public hasProposedAtMeeting;

    /// @dev proposalId => voter => attended
    mapping(uint256 => mapping(address => bool)) public hasAttended;

    /// @dev proposalId => voter => voted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @dev proposalId => cosigner => has cosigned
    mapping(uint256 => mapping(address => bool)) public hasCosigned;

    /// @dev proposalId => delegator => proxy address (address(0) = no proxy granted)
    mapping(uint256 => mapping(address => address)) public proxyOf;

    /// @dev proposalId => delegator => proxy has already cast the vote
    mapping(uint256 => mapping(address => bool)) public proxyHasVoted;

    /// @dev proposalId => delegator => disqualified from attending/voting directly
    mapping(uint256 => mapping(address => bool)) public delegatorDisqualified;

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param token_ Address of the deployed GovernanceToken contract.
     */
    constructor(address token_) Ownable(msg.sender) {
        if (token_ == address(0)) revert ZeroAddress();
        token = GovernanceToken(token_);
    }

    // ─── Phase Management ─────────────────────────────────────────────────────

    /**
     * @notice Open the proposal phase for an upcoming shareholders' meeting.
     * @dev Enforces statutory notice periods:
     *      - Public company: notice must be given ≥30 days before meeting.
     *      - General company: notice must be given ≥20 days before meeting.
     *      A baseline snapshot is taken so cosign-eligibility can be checked.
     * @param meetingDate      Unix timestamp of the meeting date.
     * @param _isPublicCompany True if the company is publicly listed.
     */
    function openProposingPhase(uint256 meetingDate, bool _isPublicCompany) external onlyOwner {
        if (currentPhase != Phase.NotStarted) revert InvalidPhase(currentPhase);

        uint256 noticePeriod = _isPublicCompany ? 30 days : 20 days;
        uint256 deadline = meetingDate - noticePeriod;
        if (block.timestamp > deadline) {
            revert MeetingTooSoon(block.timestamp, deadline);
        }

        currentMeetingDate = meetingDate;
        isPublicCompany = _isPublicCompany;
        currentPhase = Phase.Proposing;
        meetingSnapshotId = token.takeSnapshot();

        emit MeetingOpened(meetingDate, _isPublicCompany, meetingSnapshotId);
    }

    /**
     * @notice Move a proposal into the voting phase and set its electronic vote window.
     * @dev Electronic voting must close at least 2 days before the meeting date.
     *      Takes a per-proposal snapshot so only balances at this moment are eligible.
     *      After this call the system-wide phase becomes Voting; no new proposals may
     *      be submitted.
     * @param proposalId The proposal to open for voting.
     * @param voteEnd    Unix timestamp when electronic voting closes.
     */
    function startVoting(uint256 proposalId, uint256 voteEnd) external onlyOwner {
        if (currentPhase != Phase.Proposing) revert InvalidPhase(currentPhase);
        Proposal storage p = _requireProposal(proposalId);
        if (p.votingStarted) revert VotingAlreadyStarted(proposalId);
        if (!p.isActive) revert ProposalNotActive(proposalId);

        uint256 limit = currentMeetingDate - 2 days;
        if (voteEnd > limit) revert VoteEndTooLate(voteEnd, limit);

        uint256 snapId = token.takeSnapshot();
        p.snapshotId = snapId;
        p.voteEnd = voteEnd;
        p.meetingDate = currentMeetingDate;
        p.totalSupplyAtSnapshot = token.totalSupplyAt(snapId);
        p.votingStarted = true;

        currentPhase = Phase.Voting;

        emit VotingStarted(proposalId, voteEnd, snapId);
    }

    // ─── Proposal Creation ────────────────────────────────────────────────────

    /**
     * @notice Submit a proposal. Requires ≥1% of current total supply.
     *         Each shareholder may submit at most one proposal per meeting.
     *         Description must be ≤300 characters (≤900 UTF-8 bytes).
     *         Special-category proposals (AmendCharter, Dissolve) are automatically
     *         filed; no separate validation needed beyond being in Proposing phase.
     * @param description The proposal text (max 300 chars).
     * @param pType       Proposal classification.
     * @return proposalId The newly assigned proposal ID.
     */
    function createProposal(string calldata description, ProposalType pType)
        external
        nonReentrant
        returns (uint256 proposalId)
    {
        if (currentPhase != Phase.Proposing) revert InvalidPhase(currentPhase);
        if (bytes(description).length > 900) revert DescriptionTooLong(bytes(description).length);

        uint256 balance = token.balanceOf(msg.sender);
        uint256 supply = token.totalSupply();
        // 1% check: balance * 100 >= supply (integer-only, no division)
        if (balance * 100 < supply) {
            revert InsufficientTokensToPropose(balance, supply / 100);
        }

        if (hasProposedAtMeeting[msg.sender][currentMeetingDate]) {
            revert AlreadyProposedAtMeeting(msg.sender);
        }
        hasProposedAtMeeting[msg.sender][currentMeetingDate] = true;

        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.proposer = msg.sender;
        p.description = description;
        p.pType = pType;
        p.meetingDate = currentMeetingDate;
        p.isActive = true;

        emit ProposalCreated(proposalId, msg.sender, pType);
    }

    /**
     * @notice Initiate a cosign proposal. No minimum balance required.
     *         The initiator automatically becomes the first cosigner.
     *         The proposal becomes active once 10 distinct shareholders have cosigned.
     *         Cosigning closes at meetingDate - 10 days.
     * @param description The proposal text (max 300 chars).
     * @param pType       Proposal classification.
     * @return proposalId The newly assigned proposal ID.
     */
    function createCosignProposal(string calldata description, ProposalType pType)
        external
        nonReentrant
        returns (uint256 proposalId)
    {
        if (currentPhase != Phase.Proposing) revert InvalidPhase(currentPhase);
        if (bytes(description).length > 900) revert DescriptionTooLong(bytes(description).length);

        uint256 deadline = currentMeetingDate - 10 days;
        if (block.timestamp >= deadline) revert CosignDeadlinePassed(type(uint256).max);

        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.proposer = msg.sender;
        p.description = description;
        p.pType = pType;
        p.meetingDate = currentMeetingDate;
        p.isCosignProposal = true;
        p.cosignDeadline = deadline;
        p.isActive = false;

        // Initiator counts as the first cosigner
        hasCosigned[proposalId][msg.sender] = true;
        p.cosignerCount = 1;

        emit CosignProposalCreated(proposalId, msg.sender, pType, deadline);
        emit ProposalCosigned(proposalId, msg.sender, 1);
    }

    /**
     * @notice Add your cosignature to a pending cosign proposal.
     *         The proposal activates automatically when the 10th cosigner signs.
     * @param proposalId The ID of the cosign proposal to support.
     */
    function cosign(uint256 proposalId) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (!p.isCosignProposal) revert NotACosignProposal(proposalId);
        if (block.timestamp > p.cosignDeadline) revert CosignDeadlinePassed(proposalId);
        if (hasCosigned[proposalId][msg.sender]) revert AlreadyCosigned(msg.sender);

        hasCosigned[proposalId][msg.sender] = true;
        p.cosignerCount++;

        emit ProposalCosigned(proposalId, msg.sender, p.cosignerCount);

        if (p.cosignerCount >= 10) {
            p.isActive = true;
            emit ProposalActivatedByCosign(proposalId);
        }
    }

    // ─── Attendance & Voting ──────────────────────────────────────────────────

    /**
     * @notice Record attendance for a proposal's voting session.
     *         Attendance adds the voter's snapshot balance to attendedShares.
     *         A voter who attends but does not call vote() is treated as abstaining.
     * @param proposalId The proposal to attend.
     */
    function attend(uint256 proposalId) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (!p.votingStarted) revert VotingNotStarted(proposalId);
        if (block.timestamp > p.voteEnd) revert VotingEnded(proposalId);
        if (delegatorDisqualified[proposalId][msg.sender]) revert DelegatorDisqualified(msg.sender);
        if (hasAttended[proposalId][msg.sender]) revert AlreadyAttended(msg.sender);

        uint256 bal = token.balanceOfAt(msg.sender, p.snapshotId);
        require(bal > 0, "no snapshot balance");

        p.attendedShares += bal;
        hasAttended[proposalId][msg.sender] = true;

        emit Attended(proposalId, msg.sender, bal);
    }

    /**
     * @notice Cast votes on a proposal after attending.
     *         The sum of forVotes + againstVotes + abstainVotes must not exceed
     *         the caller's snapshot balance (partial voting is allowed).
     *         Attended-but-no-vote is treated as full abstention at finalization.
     * @param forVotes     Shares to vote in favour.
     * @param againstVotes Shares to vote against.
     * @param abstainVotes Shares to explicitly abstain.
     * @param proposalId   The proposal being voted on.
     */
    function vote(
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 proposalId
    ) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (!hasAttended[proposalId][msg.sender]) revert NotAttended(msg.sender);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(msg.sender);
        if (block.timestamp > p.voteEnd) revert VotingEnded(proposalId);

        uint256 bal = token.balanceOfAt(msg.sender, p.snapshotId);
        uint256 cast = forVotes + againstVotes + abstainVotes;
        if (cast > bal) revert VotesExceedBalance(cast, bal);

        p.forVotes += forVotes;
        p.againstVotes += againstVotes;
        p.abstainVotes += abstainVotes;
        hasVoted[proposalId][msg.sender] = true;

        emit VoteCast(proposalId, msg.sender, forVotes, againstVotes, abstainVotes);
    }

    /**
     * @notice Compute and permanently record the resolution outcome.
     *         May be called by anyone after the voting window has closed.
     * @param proposalId The proposal to finalize.
     */
    function finalizeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (block.timestamp <= p.voteEnd) revert VotingEnded(proposalId); // still open
        if (p.finalized) revert ProposalAlreadyFinalized(proposalId);

        p.result = _computeResult(p);
        p.finalized = true;

        emit ProposalFinalized(proposalId, p.result, p.forVotes, p.againstVotes, p.abstainVotes, p.attendedShares);
    }

    // ─── Proxy Voting ─────────────────────────────────────────────────────────

    /**
     * @notice Delegate voting rights for a single proposal to another address.
     *         The delegator's snapshot balance is immediately credited to attendedShares
     *         and the delegator is barred from attending or voting directly.
     * @param proposalId The proposal for which the proxy is granted.
     * @param proxy      The address authorised to vote on the delegator's behalf.
     */
    function grantProxy(uint256 proposalId, address proxy) external nonReentrant {
        if (proxy == address(0)) revert ZeroAddress();
        Proposal storage p = _requireProposal(proposalId);
        if (!p.votingStarted) revert VotingNotStarted(proposalId);
        if (block.timestamp > p.voteEnd) revert VotingEnded(proposalId);
        if (hasAttended[proposalId][msg.sender]) revert AlreadyAttended(msg.sender);
        if (delegatorDisqualified[proposalId][msg.sender]) revert DelegatorDisqualified(msg.sender);
        if (proxyOf[proposalId][msg.sender] != address(0)) revert ProxyAlreadyGranted(msg.sender);

        uint256 bal = token.balanceOfAt(msg.sender, p.snapshotId);
        require(bal > 0, "no snapshot balance");

        proxyOf[proposalId][msg.sender] = proxy;
        delegatorDisqualified[proposalId][msg.sender] = true;
        // Count delegator as attended immediately so quorum includes their shares
        p.attendedShares += bal;
        hasAttended[proposalId][msg.sender] = true;

        emit ProxyGranted(proposalId, msg.sender, proxy);
    }

    /**
     * @notice As a designated proxy, cast votes on behalf of a delegator.
     * @param proposalId   The proposal.
     * @param delegator    The address who granted you proxy rights.
     * @param forVotes     Shares to vote in favour (from delegator's balance).
     * @param againstVotes Shares to vote against.
     * @param abstainVotes Shares to explicitly abstain.
     */
    function voteOnBehalf(
        uint256 proposalId,
        address delegator,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (proxyOf[proposalId][delegator] != msg.sender) {
            revert NotAProxy(msg.sender, delegator, proposalId);
        }
        if (proxyHasVoted[proposalId][delegator]) {
            revert ProxyAlreadyVoted(proposalId, delegator);
        }
        if (block.timestamp > p.voteEnd) revert VotingEnded(proposalId);

        uint256 bal = token.balanceOfAt(delegator, p.snapshotId);
        uint256 cast = forVotes + againstVotes + abstainVotes;
        if (cast > bal) revert VotesExceedBalance(cast, bal);

        p.forVotes += forVotes;
        p.againstVotes += againstVotes;
        p.abstainVotes += abstainVotes;
        proxyHasVoted[proposalId][delegator] = true;

        emit VoteCastOnBehalf(proposalId, msg.sender, delegator, forVotes, againstVotes, abstainVotes);
    }

    /**
     * @notice Revoke a previously granted proxy before the proxy has voted.
     *         The delegator's shares are removed from attendedShares and their
     *         disqualification is lifted so they may attend and vote directly.
     * @param proposalId The proposal for which to revoke the proxy.
     */
    function revokeProxy(uint256 proposalId) external nonReentrant {
        if (proxyOf[proposalId][msg.sender] == address(0)) revert NotAProxy(msg.sender, msg.sender, proposalId);
        if (proxyHasVoted[proposalId][msg.sender]) revert CannotRevokeAfterProxyVoted();

        Proposal storage p = _requireProposal(proposalId);
        uint256 bal = token.balanceOfAt(msg.sender, p.snapshotId);

        p.attendedShares -= bal;
        hasAttended[proposalId][msg.sender] = false;
        delegatorDisqualified[proposalId][msg.sender] = false;
        proxyOf[proposalId][msg.sender] = address(0);

        emit ProxyRevoked(proposalId, msg.sender);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Return the result of a finalised proposal.
     * @param proposalId The proposal ID.
     * @return result The resolution outcome (Pending if not yet finalized).
     */
    function getProposalResult(uint256 proposalId) external view returns (VoteResult result) {
        return proposals[proposalId].result;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Revert if a proposal with proposalId does not exist, then return storage ref.
     */
    function _requireProposal(uint256 proposalId) internal view returns (Proposal storage) {
        // nextProposalId is incremented after assignment, so valid IDs are [0, nextProposalId)
        if (proposalId >= nextProposalId) revert ProposalNotFound(proposalId);
        return proposals[proposalId];
    }

    /**
     * @dev Compute resolution outcome from integer thresholds only.
     *      All arithmetic uses Solidity 0.8.x checked math; no floating-point operations.
     *
     *      Ordinary     : quorum = attendedShares*2 > totalSupply
     *                     pass   = forVotes*2 > attendedShares
     *
     *      Special /
     *      AmendCharter /
     *      Dissolve     : quorum = attendedShares*3 >= totalSupply*2
     *                     pass   = forVotes*2 > attendedShares
     *
     *      PublicSpecial : quorum = attendedShares*2 >= totalSupply
     *                      pass   = forVotes*3 >= attendedShares*2
     */
    function _computeResult(Proposal storage p) internal view returns (VoteResult) {
        uint256 ts = p.totalSupplyAtSnapshot;
        uint256 attended = p.attendedShares;
        uint256 forV = p.forVotes;

        if (p.pType == ProposalType.Ordinary) {
            if (attended * 2 > ts && forV * 2 > attended) return VoteResult.Passed;

        } else if (
            p.pType == ProposalType.Special ||
            p.pType == ProposalType.AmendCharter ||
            p.pType == ProposalType.Dissolve
        ) {
            if (attended * 3 >= ts * 2 && forV * 2 > attended) return VoteResult.Passed;

        } else if (p.pType == ProposalType.PublicSpecial) {
            if (attended * 2 >= ts && forV * 3 >= attended * 2) return VoteResult.Passed;
        }

        return VoteResult.Failed;
    }
}
