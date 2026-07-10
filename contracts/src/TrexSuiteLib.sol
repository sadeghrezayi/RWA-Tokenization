// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ClaimTopicsRegistry} from "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import {TrustedIssuersRegistry} from "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import {IdentityRegistryStorage} from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import {IdentityRegistry} from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import {ModularCompliance} from "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";
import {Token} from "@tokenysolutions/t-rex/contracts/token/Token.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";

struct TrexSuite {
    ClaimTopicsRegistry claimTopicsRegistry;
    TrustedIssuersRegistry trustedIssuersRegistry;
    IdentityRegistryStorage identityRegistryStorage;
    IdentityRegistry identityRegistry;
    ModularCompliance compliance;
    Token token;
}

/// Deploys the reference ERC-3643 suite for one asset token (FR-SC-1),
/// registers the KYC claim topic and trusted issuer, and hands agent rights
/// plus ownership of every contract to `operator`.
///
/// A library (internal, inlined into the caller) on purpose: a standalone
/// deployer contract would embed all six creation bytecodes and blow past the
/// EIP-170 code-size limit when deployed to a real network.
library TrexSuiteLib {
    function deploySuite(
        address operator,
        IClaimIssuer kycClaimIssuer,
        uint256 kycClaimTopic,
        string memory name,
        string memory symbol,
        uint8 decimals
    ) internal returns (TrexSuite memory suite) {
        suite.claimTopicsRegistry = new ClaimTopicsRegistry();
        suite.claimTopicsRegistry.init();
        suite.trustedIssuersRegistry = new TrustedIssuersRegistry();
        suite.trustedIssuersRegistry.init();
        suite.identityRegistryStorage = new IdentityRegistryStorage();
        suite.identityRegistryStorage.init();
        suite.identityRegistry = new IdentityRegistry();
        suite.identityRegistry.init(
            address(suite.trustedIssuersRegistry),
            address(suite.claimTopicsRegistry),
            address(suite.identityRegistryStorage)
        );
        suite.identityRegistryStorage.bindIdentityRegistry(address(suite.identityRegistry));

        suite.compliance = new ModularCompliance();
        suite.compliance.init();
        suite.token = new Token();
        // Token ONCHAINID is optional at init and can be set by the owner later.
        suite.token.init(
            address(suite.identityRegistry),
            address(suite.compliance),
            name,
            symbol,
            decimals,
            address(0)
        );

        suite.claimTopicsRegistry.addClaimTopic(kycClaimTopic);
        uint256[] memory topics = new uint256[](1);
        topics[0] = kycClaimTopic;
        suite.trustedIssuersRegistry.addTrustedIssuer(kycClaimIssuer, topics);

        suite.token.addAgent(operator);
        suite.identityRegistry.addAgent(operator);

        suite.claimTopicsRegistry.transferOwnership(operator);
        suite.trustedIssuersRegistry.transferOwnership(operator);
        suite.identityRegistryStorage.transferOwnership(operator);
        suite.identityRegistry.transferOwnership(operator);
        suite.compliance.transferOwnership(operator);
        suite.token.transferOwnership(operator);
    }
}
