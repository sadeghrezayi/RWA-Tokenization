import { beforeAll, describe, expect, it } from "vitest";
import { Contract, ContractFactory, HDNodeWallet, JsonRpcProvider } from "ethers";
import claimIssuerArtifact from "@onchain-id/solidity/artifacts/contracts/ClaimIssuer.sol/ClaimIssuer.json";
import { TrexAssetTokenDeployer } from "../../src/infrastructure/chain/trex-asset-token-deployer.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";

// Requires a running anvil devnet (root `docker compose` + anvil, see memory).
describe("TrexAssetTokenDeployer (integration, anvil devnet)", () => {
  let deployer: TrexAssetTokenDeployer;
  let provider: JsonRpcProvider;

  beforeAll(async () => {
    provider = new JsonRpcProvider(RPC_URL);
    const signer = HDNodeWallet.fromPhrase(MNEMONIC).connect(provider);
    const claimIssuer = await new ContractFactory(
      claimIssuerArtifact.abi,
      claimIssuerArtifact.bytecode,
      signer,
    ).deploy(signer.address);
    await claimIssuer.waitForDeployment();
    deployer = new TrexAssetTokenDeployer({
      rpcUrl: RPC_URL,
      operatorMnemonic: MNEMONIC,
      claimIssuerAddress: await claimIssuer.getAddress(),
    });
  });

  it("deploys_a_wired_erc3643_suite_for_the_asset", async () => {
    const { tokenAddress } = await deployer.deployAssetToken({
      assetId: "asset-int-1",
      name: "Pilot Real Estate SPV",
      symbol: "PRES",
    });

    const token = new Contract(
      tokenAddress,
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function paused() view returns (bool)",
        "function identityRegistry() view returns (address)",
        "function compliance() view returns (address)",
      ],
      provider,
    ) as Contract & {
      name(): Promise<string>;
      symbol(): Promise<string>;
      decimals(): Promise<bigint>;
      paused(): Promise<boolean>;
      identityRegistry(): Promise<string>;
    };

    expect(await token.name()).toBe("Pilot Real Estate SPV");
    expect(await token.symbol()).toBe("PRES");
    expect(await token.decimals()).toBe(0n);
    // T-REX tokens deploy paused; the operator unpauses at issuance (FR-PI).
    expect(await token.paused()).toBe(true);

    const registryAddress = await token.identityRegistry();
    expect(registryAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const registry = new Contract(
      registryAddress,
      ["function isAgent(address) view returns (bool)"],
      provider,
    ) as Contract & { isAgent(address: string): Promise<boolean> };
    const operator = HDNodeWallet.fromPhrase(MNEMONIC).address;
    expect(await registry.isAgent(operator)).toBe(true);
  });
});
