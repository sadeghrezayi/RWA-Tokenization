import {
  Contract,
  ContractFactory,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  ZeroAddress,
} from "ethers";
import type { ContractTransactionResponse, InterfaceAbi, Signer } from "ethers";
import ctrArtifact from "@tokenysolutions/t-rex/artifacts/contracts/registry/implementation/ClaimTopicsRegistry.sol/ClaimTopicsRegistry.json";
import tirArtifact from "@tokenysolutions/t-rex/artifacts/contracts/registry/implementation/TrustedIssuersRegistry.sol/TrustedIssuersRegistry.json";
import irsArtifact from "@tokenysolutions/t-rex/artifacts/contracts/registry/implementation/IdentityRegistryStorage.sol/IdentityRegistryStorage.json";
import irArtifact from "@tokenysolutions/t-rex/artifacts/contracts/registry/implementation/IdentityRegistry.sol/IdentityRegistry.json";
import mcArtifact from "@tokenysolutions/t-rex/artifacts/contracts/compliance/modular/ModularCompliance.sol/ModularCompliance.json";
import tokenArtifact from "@tokenysolutions/t-rex/artifacts/contracts/token/Token.sol/Token.json";
import type { AssetTokenDeployer } from "../../application/assets/ports.js";
import { CLAIM_TOPIC_KYC } from "./onchainid-claim-issuer.js";
import type { OnchainidConfig } from "./onchainid-claim-issuer.js";

interface Artifact {
  abi: InterfaceAbi;
  bytecode: string;
}

// FR-SC-1: per-asset ERC-3643 (T-REX) suite on the devnet — the ethers twin of
// contracts/src/TrexSuiteLib.sol. Asset tokens are whole units (decimals 0).
// The platform ClaimIssuer (KYC topic) is the suite's trusted issuer, so the
// same identity claims that gate KYC also gate token transfers.
export class TrexAssetTokenDeployer implements AssetTokenDeployer {
  constructor(private readonly config: OnchainidConfig) {}

  async deployAssetToken(params: {
    assetId: string;
    name: string;
    symbol: string;
  }): Promise<{ tokenAddress: string }> {
    const provider = new JsonRpcProvider(this.config.rpcUrl);
    const operator = new NonceManager(
      HDNodeWallet.fromPhrase(this.config.operatorMnemonic).connect(provider),
    );
    const operatorAddress = await operator.getAddress();

    const claimTopics = await this.deploy(ctrArtifact, operator);
    await this.call(claimTopics, "init");
    const trustedIssuers = await this.deploy(tirArtifact, operator);
    await this.call(trustedIssuers, "init");
    const registryStorage = await this.deploy(irsArtifact, operator);
    await this.call(registryStorage, "init");
    const identityRegistry = await this.deploy(irArtifact, operator);
    await this.call(
      identityRegistry,
      "init",
      await trustedIssuers.getAddress(),
      await claimTopics.getAddress(),
      await registryStorage.getAddress(),
    );
    await this.call(registryStorage, "bindIdentityRegistry", await identityRegistry.getAddress());

    const compliance = await this.deploy(mcArtifact, operator);
    await this.call(compliance, "init");
    const token = await this.deploy(tokenArtifact, operator);
    await this.call(
      token,
      "init",
      await identityRegistry.getAddress(),
      await compliance.getAddress(),
      params.name,
      params.symbol,
      0,
      ZeroAddress,
    );

    await this.call(claimTopics, "addClaimTopic", CLAIM_TOPIC_KYC);
    await this.call(trustedIssuers, "addTrustedIssuer", this.config.claimIssuerAddress, [
      CLAIM_TOPIC_KYC,
    ]);
    await this.call(token, "addAgent", operatorAddress);
    await this.call(identityRegistry, "addAgent", operatorAddress);

    return { tokenAddress: await token.getAddress() };
  }

  private async deploy(artifact: Artifact, signer: Signer): Promise<Contract> {
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract as Contract;
  }

  private async call(contract: Contract, method: string, ...args: unknown[]): Promise<void> {
    const fn = contract.getFunction(method);
    const tx = (await fn(...args)) as ContractTransactionResponse;
    await tx.wait();
  }
}
