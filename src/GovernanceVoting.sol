// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./GovernanceToken.sol";

/**
 * @title GovernanceVoting
 *
 * 電子投票時間軸（votingStartDeadline = startVoting 的最晚期限）
 * ─────────────────────────────────────────────────────────────
 *  常會  + 公開發行  │ meetingDate - 30d  (§172)
 *  常會  + 一般公司  │ meetingDate - 20d
 *  臨時會 + 公開發行  │ meetingDate - 15d
 *  臨時會 + 一般公司  │ meetingDate - 20d
 *
 * proposingDeadline = votingStartDeadline - 10d
 *   → 股東在此之前提案；之後 10 天董事會審查，準時寄通知
 *
 * voteEnd <= meetingDate - 2d  (§177-1)
 *
 * 通過條件：
 *   普通決議 (§174)          forVotes > 投票總數 / 2
 *   特別/修章/解散/公發特別   forVotes >= 投票總數 * 2 / 3
 */
contract GovernanceVoting is Ownable, ReentrancyGuard {
    enum Phase { NotStarted, Proposing, Voting, Closed }
    enum ProposalType { Ordinary, Special, AmendCharter, Dissolve, PublicSpecial }
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
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool isCosignProposal;
        uint256 cosignDeadline;
        uint256 cosignerCount;
        bool isActive;
        bool votingStarted;
        bool finalized;
        VoteResult result;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvalidPhase(Phase current);
    /// openProposingPhase called too late — proposingDeadline already passed.
    error MeetingTooSoon(uint256 timestamp, uint256 proposingDeadline);
    /// createProposal / createCosignProposal called after proposingDeadline.
    error ProposingDeadlinePassed();
    /// startVoting called before proposingDeadline.
    error ProposingStillOpen(uint256 deadline);
    /// startVoting called after the legal deadline (30d / 20d / 15d before meeting).
    error VotingStartTooLate(uint256 deadline);
    error VoteEndTooLate(uint256 voteEnd, uint256 limit);
    error DescriptionTooLong(uint256 length);
    error InsufficientTokensToPropose(uint256 balance, uint256 required);
    error AlreadyProposedAtMeeting(address proposer);
    error ProposalNotFound(uint256 proposalId);
    /// cosign 提案在第 10 位聯署人簽名時，所有聯署人持股合計未達總股份 1%。
    error CollectiveBalanceBelowThreshold(uint256 collective, uint256 required);
    error VotingNotStarted(uint256 proposalId);
    error VotingEnded(uint256 proposalId);
    error AlreadyVoted(address voter);
    error VotesExceedBalance(uint256 cast, uint256 available);
    error CosignDeadlinePassed(uint256 proposalId);
    error AlreadyCosigned(address cosigner);
    error NotACosignProposal(uint256 proposalId);
    error ProposalNotActive(uint256 proposalId);
    error ProxyAlreadyGranted(address delegator);
    error ProxyAlreadyVoted(uint256 proposalId, address delegator);
    error NotAProxy(address caller, address delegator, uint256 proposalId);
    error CannotRevokeAfterProxyVoted();
    error VotingAlreadyStarted(uint256 proposalId);
    error ProposalAlreadyFinalized(uint256 proposalId);
    error AlreadyGrantedProxy(address delegator);
    error ZeroAddress();

    // ─── Events ───────────────────────────────────────────────────────────────

    event MeetingOpened(uint256 indexed meetingDate, bool isPublicCompany, bool isExtraordinary, uint256 snapshotId, uint256 proposingDeadline, uint256 votingStartDeadline);
    event VotingStarted(uint256 indexed proposalId, uint256 voteEnd, uint256 snapshotId);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, ProposalType pType);
    event CosignProposalCreated(uint256 indexed proposalId, address indexed initiator, ProposalType pType, uint256 cosignDeadline);
    event ProposalCosigned(uint256 indexed proposalId, address indexed cosigner, uint256 cosignerCount);
    event ProposalActivatedByCosign(uint256 indexed proposalId);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes);
    event ProxyGranted(uint256 indexed proposalId, address indexed delegator, address indexed proxy);
    event ProxyRevoked(uint256 indexed proposalId, address indexed delegator);
    event VoteCastOnBehalf(uint256 indexed proposalId, address indexed proxy, address indexed delegator, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes);
    event ProposalFinalized(uint256 indexed proposalId, VoteResult result, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes);

    // ─── State ────────────────────────────────────────────────────────────────

    GovernanceToken public immutable token;

    uint256 public currentMeetingDate;
    bool    public isPublicCompany;
    bool    public isExtraordinary;
    Phase   public currentPhase;
    uint256 public meetingSnapshotId;
    uint256 public nextProposalId;

    /// @notice Proposals must be submitted before this timestamp (votingStartDeadline - 10d).
    uint256 public proposingDeadline;
    /// @notice startVoting must be called on or before this timestamp.
    uint256 public votingStartDeadline;

    /// @notice Admin-controlled time offset for demo/testing purposes.
    uint256 public timeOffset;

    function _now() internal view returns (uint256) { return block.timestamp + timeOffset; }
    function currentTime() external view returns (uint256) { return block.timestamp + timeOffset; }
    function addTimeOffset(uint256 secs) external onlyOwner { timeOffset += secs; }

    mapping(uint256 => Proposal) public proposals;
    mapping(address => mapping(uint256 => bool)) public hasProposedAtMeeting;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public hasCosigned;
    mapping(uint256 => mapping(address => address)) public proxyOf;
    mapping(uint256 => mapping(address => bool)) public proxyHasVoted;

    /// @dev Ordered list of unique cosigner addresses, used for collective-balance check at activation.
    mapping(uint256 => address[]) private _cosignerList;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address token_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = GovernanceToken(token_);
    }

    // ─── Phase Management ─────────────────────────────────────────────────────

    /**
     * @notice Open the proposing window.
     * @param meetingDate      Unix timestamp of the meeting.
     * @param _isPublicCompany True for 公開發行公司.
     * @param _isExtraordinary True for 臨時會; false for 常會.
     */
    function openProposingPhase(
        uint256 meetingDate,
        bool _isPublicCompany,
        bool _isExtraordinary
    ) external onlyOwner {
        if (currentPhase != Phase.NotStarted && currentPhase != Phase.Closed) revert InvalidPhase(currentPhase);

        uint256 vDeadline = _calcVotingStartDeadline(meetingDate, _isPublicCompany, _isExtraordinary);
        uint256 pDeadline = vDeadline - 10 days;
        if (_now() >= pDeadline) revert MeetingTooSoon(_now(), pDeadline);

        currentMeetingDate   = meetingDate;
        isPublicCompany      = _isPublicCompany;
        isExtraordinary      = _isExtraordinary;
        proposingDeadline    = pDeadline;
        votingStartDeadline  = vDeadline;
        currentPhase         = Phase.Proposing;
        meetingSnapshotId    = token.takeSnapshot();

        emit MeetingOpened(meetingDate, _isPublicCompany, _isExtraordinary, meetingSnapshotId, pDeadline, vDeadline);
    }

    /**
     * @notice Open electronic voting for a proposal.
     *         Must be called AFTER proposingDeadline and NO LATER THAN votingStartDeadline.
     *         voteEnd must be <= meetingDate - 2 days.
     */
    function startVoting(uint256 proposalId, uint256 voteEnd) external onlyOwner {
        if (currentPhase != Phase.Proposing && currentPhase != Phase.Voting) revert InvalidPhase(currentPhase);
        if (_now() < proposingDeadline) revert ProposingStillOpen(proposingDeadline);

        Proposal storage p = _requireProposal(proposalId);
        if (p.votingStarted) revert VotingAlreadyStarted(proposalId);
        if (!p.isActive)     revert ProposalNotActive(proposalId);

        uint256 limit = currentMeetingDate - 2 days;
        if (voteEnd > limit) revert VoteEndTooLate(voteEnd, limit);

        uint256 snapId           = token.takeSnapshot();
        p.snapshotId             = snapId;
        p.voteEnd                = voteEnd;
        p.meetingDate            = currentMeetingDate;
        p.totalSupplyAtSnapshot  = token.totalSupplyAt(snapId);
        p.votingStarted          = true;
        currentPhase             = Phase.Voting;

        emit VotingStarted(proposalId, voteEnd, snapId);
    }

    function closePhase() external onlyOwner {
        currentPhase = Phase.Closed;
    }

    // ─── Proposal Creation ────────────────────────────────────────────────────

    function createProposal(string calldata description, ProposalType pType)
        external nonReentrant returns (uint256 proposalId)
    {
        if (currentPhase != Phase.Proposing) revert InvalidPhase(currentPhase);
        if (_now() >= proposingDeadline) revert ProposingDeadlinePassed();
        if (bytes(description).length > 900) revert DescriptionTooLong(bytes(description).length);

        uint256 balance = token.balanceOf(msg.sender);
        uint256 supply  = token.totalSupply();
        if (balance * 100 < supply) revert InsufficientTokensToPropose(balance, supply / 100);
        if (hasProposedAtMeeting[msg.sender][currentMeetingDate]) revert AlreadyProposedAtMeeting(msg.sender);

        hasProposedAtMeeting[msg.sender][currentMeetingDate] = true;
        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId; p.proposer = msg.sender; p.description = description;
        p.pType = pType; p.meetingDate = currentMeetingDate; p.isActive = true;

        emit ProposalCreated(proposalId, msg.sender, pType);
    }

    function createCosignProposal(string calldata description, ProposalType pType)
        external nonReentrant returns (uint256 proposalId)
    {
        if (currentPhase != Phase.Proposing) revert InvalidPhase(currentPhase);
        if (_now() >= proposingDeadline) revert ProposingDeadlinePassed();
        if (bytes(description).length > 900) revert DescriptionTooLong(bytes(description).length);

        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId; p.proposer = msg.sender; p.description = description;
        p.pType = pType; p.meetingDate = currentMeetingDate;
        p.isCosignProposal = true;
        p.cosignDeadline   = proposingDeadline;
        p.isActive         = false;

        hasCosigned[proposalId][msg.sender] = true;
        _cosignerList[proposalId].push(msg.sender);
        p.cosignerCount = 1;

        emit CosignProposalCreated(proposalId, msg.sender, pType, proposingDeadline);
        emit ProposalCosigned(proposalId, msg.sender, 1);
    }

    function cosign(uint256 proposalId) external nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (!p.isCosignProposal) revert NotACosignProposal(proposalId);
        if (_now() >= p.cosignDeadline) revert CosignDeadlinePassed(proposalId);
        if (hasCosigned[proposalId][msg.sender]) revert AlreadyCosigned(msg.sender);

        hasCosigned[proposalId][msg.sender] = true;
        _cosignerList[proposalId].push(msg.sender);
        p.cosignerCount++;
        emit ProposalCosigned(proposalId, msg.sender, p.cosignerCount);

        if (p.cosignerCount >= 10) {
            _requireCosignersCollective1Pct(proposalId);
            p.isActive = true;
            emit ProposalActivatedByCosign(proposalId);
        }
    }

    // ─── Voting ───────────────────────────────────────────────────────────────

    function vote(uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 proposalId)
        external nonReentrant
    {
        Proposal storage p = _requireProposal(proposalId);
        if (!p.votingStarted) revert VotingNotStarted(proposalId);
        if (_now() > p.voteEnd) revert VotingEnded(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(msg.sender);
        if (proxyOf[proposalId][msg.sender] != address(0)) revert AlreadyGrantedProxy(msg.sender);

        uint256 bal  = token.balanceOfAt(msg.sender, p.snapshotId);
        uint256 cast = forVotes + againstVotes + abstainVotes;
        if (cast > bal) revert VotesExceedBalance(cast, bal);

        p.forVotes += forVotes; p.againstVotes += againstVotes; p.abstainVotes += abstainVotes;
        hasVoted[proposalId][msg.sender] = true;
        emit VoteCast(proposalId, msg.sender, forVotes, againstVotes, abstainVotes);
    }

    function finalizeProposal(uint256 proposalId) external onlyOwner nonReentrant {
        Proposal storage p = _requireProposal(proposalId);
        if (_now() <= p.voteEnd) revert VotingEnded(proposalId);
        if (p.finalized) revert ProposalAlreadyFinalized(proposalId);
        p.result = _computeResult(p);
        p.finalized = true;
        emit ProposalFinalized(proposalId, p.result, p.forVotes, p.againstVotes, p.abstainVotes);
    }

    // ─── Proxy Voting ─────────────────────────────────────────────────────────

    function grantProxy(uint256 proposalId, address proxy) external nonReentrant {
        if (proxy == address(0)) revert ZeroAddress();
        Proposal storage p = _requireProposal(proposalId);
        if (!p.votingStarted) revert VotingNotStarted(proposalId);
        if (_now() > p.voteEnd) revert VotingEnded(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(msg.sender);
        if (proxyOf[proposalId][msg.sender] != address(0)) revert ProxyAlreadyGranted(msg.sender);
        proxyOf[proposalId][msg.sender] = proxy;
        emit ProxyGranted(proposalId, msg.sender, proxy);
    }

    function voteOnBehalf(uint256 proposalId, address delegator, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes)
        external nonReentrant
    {
        Proposal storage p = _requireProposal(proposalId);
        if (proxyOf[proposalId][delegator] != msg.sender) revert NotAProxy(msg.sender, delegator, proposalId);
        if (proxyHasVoted[proposalId][delegator]) revert ProxyAlreadyVoted(proposalId, delegator);
        if (_now() > p.voteEnd) revert VotingEnded(proposalId);

        uint256 bal  = token.balanceOfAt(delegator, p.snapshotId);
        uint256 cast = forVotes + againstVotes + abstainVotes;
        if (cast > bal) revert VotesExceedBalance(cast, bal);

        p.forVotes += forVotes; p.againstVotes += againstVotes; p.abstainVotes += abstainVotes;
        proxyHasVoted[proposalId][delegator] = true;
        emit VoteCastOnBehalf(proposalId, msg.sender, delegator, forVotes, againstVotes, abstainVotes);
    }

    function revokeProxy(uint256 proposalId) external nonReentrant {
        if (proxyOf[proposalId][msg.sender] == address(0)) revert NotAProxy(msg.sender, msg.sender, proposalId);
        if (proxyHasVoted[proposalId][msg.sender]) revert CannotRevokeAfterProxyVoted();
        proxyOf[proposalId][msg.sender] = address(0);
        emit ProxyRevoked(proposalId, msg.sender);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getProposalVoteEnd(uint256 proposalId) external view returns (uint256) {
        return proposals[proposalId].voteEnd;
    }

    function getProposalCosignInfo(uint256 proposalId)
        external view returns (uint256 deadline, uint256 count, bool active)
    {
        Proposal storage p = proposals[proposalId];
        return (p.cosignDeadline, p.cosignerCount, p.isActive);
    }

    function getProposalFinalized(uint256 proposalId)
        external view returns (bool finalized, VoteResult result)
    {
        Proposal storage p = proposals[proposalId];
        return (p.finalized, p.result);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Sum of all cosigners' current balances must be >= 1% of total supply.
    function _requireCosignersCollective1Pct(uint256 proposalId) internal view {
        address[] storage signers = _cosignerList[proposalId];
        uint256 collective = 0;
        for (uint256 i = 0; i < signers.length; ) {
            collective += token.balanceOf(signers[i]);
            unchecked { ++i; }
        }
        uint256 supply = token.totalSupply();
        if (collective * 100 < supply) revert CollectiveBalanceBelowThreshold(collective, supply / 100);
    }

    function _requireProposal(uint256 proposalId) internal view returns (Proposal storage) {
        if (proposalId >= nextProposalId) revert ProposalNotFound(proposalId);
        return proposals[proposalId];
    }

    /// @dev Ordinary (§174): forVotes > 50% of votes cast.
    ///      Special / AmendCharter / Dissolve / PublicSpecial (§185/316): forVotes >= 2/3 of votes cast.
    function _computeResult(Proposal storage p) internal view returns (VoteResult) {
        uint256 totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;
        if (totalVotes == 0) return VoteResult.Failed;
        if (p.pType == ProposalType.Ordinary) {
            if (p.forVotes * 2 > totalVotes) return VoteResult.Passed;
        } else {
            if (p.forVotes * 3 >= totalVotes * 2) return VoteResult.Passed;
        }
        return VoteResult.Failed;
    }

    /**
     * @dev Returns the latest timestamp at which startVoting may be called.
     *      常會公開  30d | 常會一般  20d | 臨時會公開  15d | 臨時會一般  20d
     */
    function _calcVotingStartDeadline(uint256 mDate, bool _isPublic, bool _isExtraordinary)
        internal pure returns (uint256)
    {
        if (_isExtraordinary && _isPublic)   return mDate - 15 days;  // §172 臨時會公開發行
        if (!_isExtraordinary && _isPublic)  return mDate - 30 days;  // §172 常會公開發行
        if (_isExtraordinary)                return mDate - 10 days;  // §172 臨時會一般公司
        return mDate - 20 days;                                        // §172 常會一般公司
    }
}
