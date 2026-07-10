// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ClaimIssuer} from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
import {TrexSuiteLib, TrexSuite} from "../src/TrexSuiteLib.sol";

/// Devnet deployment: platform ClaimIssuer + the ERC-3643 reference suite for
/// the pilot asset. Prints the env values the API needs.
/// Run: forge script script/Deploy.s.sol --rpc-url $DEVNET_RPC_URL --broadcast
contract Deploy is Script {
    uint256 internal constant KYC_TOPIC = 1;

    function run() external {
        uint256 operatorKey = vm.deriveKey(vm.envString("PLATFORM_OPERATOR_MNEMONIC"), 0);
        address operator = vm.addr(operatorKey);

        vm.startBroadcast(operatorKey);
        ClaimIssuer claimIssuer = new ClaimIssuer(operator);
        TrexSuite memory suite = TrexSuiteLib.deploySuite(
            operator,
            IClaimIssuer(address(claimIssuer)),
            KYC_TOPIC,
            "Pilot Real Estate SPV",
            "PRES",
            0
        );
        vm.stopBroadcast();

        console2.log("PLATFORM_OPERATOR=%s", operator);
        console2.log("ONCHAINID_CLAIM_ISSUER_ADDRESS=%s", address(claimIssuer));
        console2.log("TREX_TOKEN_ADDRESS=%s", address(suite.token));
        console2.log("TREX_IDENTITY_REGISTRY=%s", address(suite.identityRegistry));
        console2.log("TREX_COMPLIANCE=%s", address(suite.compliance));
    }
}
