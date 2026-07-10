// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";
import {Identity} from "@onchain-id/solidity/contracts/Identity.sol";
import {ClaimIssuer} from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
import {IIdentity} from "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import {TrexSuiteLib, TrexSuite} from "../src/TrexSuiteLib.sol";

// FR-SC-1: transfers execute only when both parties' claims pass — verified
// against the reference ERC-3643 deployment, adversarial paths included.
contract TrexSuiteTest is Test {
    uint256 internal constant KYC_TOPIC = 1;
    uint256 internal constant CLAIM_SIGNER_KEY = 0xC1A13;
    uint16 internal constant COUNTRY_IRAN = 364;

    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    ClaimIssuer internal claimIssuer;
    TrexSuite internal suite;
    Identity internal aliceId;
    Identity internal bobId;

    function setUp() public {
        claimIssuer = new ClaimIssuer(vm.addr(CLAIM_SIGNER_KEY));
        suite = TrexSuiteLib.deploySuite(
            operator,
            IClaimIssuer(address(claimIssuer)),
            KYC_TOPIC,
            "Pilot Real Estate SPV",
            "PRES",
            0
        );

        aliceId = new Identity(alice, false);
        bobId = new Identity(bob, false);
        _issueKycClaim(aliceId, alice);
        _issueKycClaim(bobId, bob);

        vm.startPrank(operator);
        suite.identityRegistry.registerIdentity(alice, IIdentity(address(aliceId)), COUNTRY_IRAN);
        suite.identityRegistry.registerIdentity(bob, IIdentity(address(bobId)), COUNTRY_IRAN);
        suite.token.unpause();
        suite.token.mint(alice, 1000);
        vm.stopPrank();
    }

    function test_suite_is_wired_and_verifies_claimed_identities() public {
        assertTrue(suite.identityRegistry.isVerified(alice));
        assertTrue(suite.identityRegistry.isVerified(bob));
        assertEq(suite.token.balanceOf(alice), 1000);
        assertEq(suite.token.name(), "Pilot Real Estate SPV");
        assertEq(suite.token.owner(), operator);
    }

    function test_compliant_transfer_between_verified_holders_succeeds() public {
        vm.prank(alice);
        suite.token.transfer(bob, 250);
        assertEq(suite.token.balanceOf(alice), 750);
        assertEq(suite.token.balanceOf(bob), 250);
    }

    function test_transfer_to_unverified_recipient_reverts_onchain() public {
        address charlie = makeAddr("charlie");
        vm.prank(alice);
        vm.expectRevert(bytes("Transfer not possible"));
        suite.token.transfer(charlie, 10);
        assertEq(suite.token.balanceOf(charlie), 0);
    }

    function test_mint_to_unverified_recipient_reverts() public {
        address charlie = makeAddr("charlie");
        vm.prank(operator);
        vm.expectRevert();
        suite.token.mint(charlie, 1);
    }

    function test_unauthorized_mint_reverts() public {
        vm.prank(alice);
        vm.expectRevert();
        suite.token.mint(alice, 1_000_000);
    }

    function test_transfer_blocked_after_claim_revocation() public {
        bytes32 claimId = keccak256(abi.encode(address(claimIssuer), KYC_TOPIC));
        (, , , bytes memory sig, , ) = bobId.getClaim(claimId);

        vm.prank(vm.addr(CLAIM_SIGNER_KEY));
        claimIssuer.revokeClaimBySignature(sig);

        assertFalse(suite.identityRegistry.isVerified(bob));
        vm.prank(alice);
        vm.expectRevert(bytes("Transfer not possible"));
        suite.token.transfer(bob, 10);
    }

    function _issueKycClaim(Identity identity, address holder) internal {
        bytes memory data = "KYC_APPROVED";
        bytes32 dataHash = keccak256(abi.encode(address(identity), KYC_TOPIC, data));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CLAIM_SIGNER_KEY, ethSignedHash);
        vm.prank(holder);
        identity.addClaim(KYC_TOPIC, 1, address(claimIssuer), abi.encodePacked(r, s, v), data, "");
    }
}
