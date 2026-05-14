// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceToken is ERC20, ERC20Snapshot, Ownable {
    error NotSnapshotCaller(address caller);
    error ArrayLengthMismatch();
    error ZeroAddress();

    event SnapshotCallerAdded(address indexed caller);
    event SnapshotCallerRemoved(address indexed caller);

    mapping(address => bool) public snapshotCallers;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < recipients.length; ) {
            _mint(recipients[i], amounts[i]);
            unchecked { ++i; }
        }
    }

    function addSnapshotCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        snapshotCallers[caller] = true;
        emit SnapshotCallerAdded(caller);
    }

    function removeSnapshotCaller(address caller) external onlyOwner {
        snapshotCallers[caller] = false;
        emit SnapshotCallerRemoved(caller);
    }

    function takeSnapshot() external returns (uint256 snapshotId) {
        if (!snapshotCallers[msg.sender] && msg.sender != owner()) {
            revert NotSnapshotCaller(msg.sender);
        }
        return _snapshot();
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Snapshot)
    {
        super._beforeTokenTransfer(from, to, amount);
    }
}
