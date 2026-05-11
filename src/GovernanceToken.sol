// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken
 * @notice Non-transferable ERC20 governance share token with KYC gating and snapshot support.
 *         1 share = 1 token. Tokens represent equity stakes and cannot be traded on secondary markets.
 *         Only the contract owner (administrator) may mint tokens or approve KYC status.
 *         Both GovernanceVoting and DirectorElection contracts must be registered as snapshot callers
 *         before they can trigger balance snapshots.
 */
contract GovernanceToken is ERC20, ERC20Snapshot, Ownable {
    // ─── Custom Errors ────────────────────────────────────────────────────────

    /// @notice Thrown when a transfer or transferFrom is attempted.
    error TransferNotAllowed();

    /// @notice Thrown when minting to, or verifying, an address that has not passed KYC.
    error KYCNotApproved(address account);

    /// @notice Thrown when an address not in snapshotCallers attempts to call takeSnapshot.
    error NotSnapshotCaller(address caller);

    /// @notice Thrown when two calldata arrays that must match in length do not.
    error ArrayLengthMismatch();

    /// @notice Thrown when address(0) is passed where a real address is required.
    error ZeroAddress();

    // ─── Events ───────────────────────────────────────────────────────────────

    event KYCApproved(address indexed account);
    event KYCRevoked(address indexed account);
    event SnapshotCallerAdded(address indexed caller);
    event SnapshotCallerRemoved(address indexed caller);

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice True iff the address has passed identity verification and may hold tokens.
    mapping(address => bool) public kycApproved;

    /// @notice Addresses authorised to trigger a balance snapshot (typically voting/election contracts).
    mapping(address => bool) public snapshotCallers;

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param name_   ERC20 token name (e.g. "CorpGovToken").
     * @param symbol_ ERC20 token symbol (e.g. "CGT").
     */
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {}

    // ─── KYC Management ───────────────────────────────────────────────────────

    /**
     * @notice Approve a single address for KYC.
     * @param account The address that has completed identity verification.
     */
    function approveKYC(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        kycApproved[account] = true;
        emit KYCApproved(account);
    }

    /**
     * @notice Approve multiple addresses for KYC in a single transaction.
     * @param accounts Array of addresses to approve.
     */
    function batchApproveKYC(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            kycApproved[accounts[i]] = true;
            emit KYCApproved(accounts[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Revoke KYC status from an address.
     *         Note: does NOT burn their tokens; call burn separately if needed.
     * @param account The address whose KYC is being revoked.
     */
    function revokeKYC(address account) external onlyOwner {
        kycApproved[account] = false;
        emit KYCRevoked(account);
    }

    // ─── Minting ──────────────────────────────────────────────────────────────

    /**
     * @notice Mint tokens to a KYC-approved address.
     * @param to     Recipient (must be KYC-approved).
     * @param amount Number of tokens (wei units; 1 share = 1e18 if decimals=18).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Mint tokens to multiple recipients in one transaction.
     * @param recipients Array of recipient addresses (all must be KYC-approved).
     * @param amounts    Corresponding token amounts.
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < recipients.length; ) {
            _mint(recipients[i], amounts[i]);
            unchecked { ++i; }
        }
    }

    // ─── Snapshot Caller Management ───────────────────────────────────────────

    /**
     * @notice Grant a contract (Voting or Election) the right to trigger snapshots.
     * @param caller The contract address to authorise.
     */
    function addSnapshotCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        snapshotCallers[caller] = true;
        emit SnapshotCallerAdded(caller);
    }

    /**
     * @notice Revoke snapshot-triggering rights from a contract.
     * @param caller The contract address to deauthorise.
     */
    function removeSnapshotCaller(address caller) external onlyOwner {
        snapshotCallers[caller] = false;
        emit SnapshotCallerRemoved(caller);
    }

    /**
     * @notice Take a balance snapshot and return the new snapshot ID.
     *         May be called by the owner or any registered snapshot caller.
     * @return snapshotId The ID of the newly created snapshot.
     */
    function takeSnapshot() external returns (uint256 snapshotId) {
        if (!snapshotCallers[msg.sender] && msg.sender != owner()) {
            revert NotSnapshotCaller(msg.sender);
        }
        return _snapshot();
    }

    // ─── Transfer Restrictions ────────────────────────────────────────────────

    /**
     * @notice Tokens are non-transferable to prevent secondary market trading of voting rights.
     */
    function transfer(address, uint256) public pure override(ERC20) returns (bool) {
        revert TransferNotAllowed();
    }

    /**
     * @notice Tokens are non-transferable to prevent secondary market trading of voting rights.
     */
    function transferFrom(address, address, uint256) public pure override(ERC20) returns (bool) {
        revert TransferNotAllowed();
    }

    // ─── Internal Hooks ───────────────────────────────────────────────────────

    /**
     * @dev OZ v5 replaces _beforeTokenTransfer with _update. We enforce KYC on the
     *      recipient for every mint (from == address(0)). Burns (to == address(0)) are
     *      allowed without KYC check. Normal transfers are blocked at the public API level
     *      above, so they never reach here.
     *
     *      The override must list both ERC20 and ERC20Snapshot because both parents
     *      define _update. C3 linearisation: ERC20Snapshot._update → ERC20._update.
     */
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Snapshot)
    {
        if (to != address(0) && !kycApproved[to]) revert KYCNotApproved(to);
        super._update(from, to, amount);
    }
}
