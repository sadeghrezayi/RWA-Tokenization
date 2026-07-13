// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry internal registry;
    bytes32 internal constant HASH = keccak256("valuation-payload");
    uint256 internal constant VALID_UNTIL = 2_000_000_000;

    event Attested(
        bytes32 indexed payloadHash,
        address indexed attestor,
        uint256 validUntil,
        uint256 anchoredAt
    );

    function setUp() public {
        registry = new AttestationRegistry();
    }

    function test_anchor_records_timestamp_validity_and_attestor() public {
        vm.expectEmit(true, true, false, true);
        emit Attested(HASH, address(this), VALID_UNTIL, block.timestamp);

        registry.anchor(HASH, VALID_UNTIL);

        assertEq(registry.anchoredAt(HASH), block.timestamp);
        AttestationRegistry.Anchor memory a = registry.anchorOf(HASH);
        assertEq(a.validUntil, VALID_UNTIL);
        assertEq(a.attestor, address(this));
    }

    function test_unanchored_hash_reports_zero() public view {
        assertEq(registry.anchoredAt(keccak256("never")), 0);
    }

    function test_double_anchor_reverts() public {
        registry.anchor(HASH, VALID_UNTIL);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.AlreadyAnchored.selector, HASH));
        registry.anchor(HASH, VALID_UNTIL);
    }
}
