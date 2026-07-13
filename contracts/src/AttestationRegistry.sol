// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// FR-OR-1: tamper-evident anchoring of signed attestation payload hashes.
/// The signature (kept off-chain) proves who attested; this registry provides
/// the immutable, timestamped on-chain record that the fact existed and until
/// when it was valid. Append-only: a payload hash can be anchored once.
contract AttestationRegistry {
    struct Anchor {
        uint256 anchoredAt;
        uint256 validUntil;
        address attestor;
    }

    mapping(bytes32 => Anchor) private _anchors;

    event Attested(
        bytes32 indexed payloadHash,
        address indexed attestor,
        uint256 validUntil,
        uint256 anchoredAt
    );

    error AlreadyAnchored(bytes32 payloadHash);

    function anchor(bytes32 payloadHash, uint256 validUntil) external {
        if (_anchors[payloadHash].anchoredAt != 0) {
            revert AlreadyAnchored(payloadHash);
        }
        _anchors[payloadHash] = Anchor(block.timestamp, validUntil, msg.sender);
        emit Attested(payloadHash, msg.sender, validUntil, block.timestamp);
    }

    /// Returns the block timestamp the hash was anchored at, or 0 if never.
    function anchoredAt(bytes32 payloadHash) external view returns (uint256) {
        return _anchors[payloadHash].anchoredAt;
    }

    function anchorOf(bytes32 payloadHash) external view returns (Anchor memory) {
        return _anchors[payloadHash];
    }
}
