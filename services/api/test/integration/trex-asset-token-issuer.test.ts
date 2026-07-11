import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Contract, ContractFactory, HDNodeWallet, JsonRpcProvider } from "ethers";
import claimIssuerArtifact from "@onchain-id/solidity/artifacts/contracts/ClaimIssuer.sol/ClaimIssuer.json";
import { PrismaClient } from "@prisma/client";
import { OnchainidClaimIssuer } from "../../src/infrastructure/chain/onchainid-claim-issuer.js";
import { TrexAssetTokenDeployer } from "../../src/infrastructure/chain/trex-asset-token-deployer.js";
import { TrexAssetTokenIssuer } from "../../src/infrastructure/chain/trex-asset-token-issuer.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";
const INVESTOR = "issuer-test-investor";

const prisma = new PrismaClient();

// Full custody path on a real devnet: KYC claim → custodial wallet →
// registry verification → mint → transfers enabled.
describe("TrexAssetTokenIssuer (integration, anvil devnet)", () => {
  let issuer: TrexAssetTokenIssuer;
  let tokenAddress: string;
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
    const config = {
      rpcUrl: RPC_URL,
      operatorMnemonic: MNEMONIC,
      claimIssuerAddress: await claimIssuer.getAddress(),
    };

    await prisma.onchainIdentity.deleteMany({ where: { investorId: INVESTOR } });
    await prisma.investorWallet.deleteMany({ where: { investorId: INVESTOR } });
    await prisma.investor.upsert({
      where: { id: INVESTOR },
      create: {
        id: INVESTOR,
        email: "issuer-test@example.com",
        passwordHash: "x",
        kycState: "approved",
      },
      update: { kycState: "approved" },
    });
    // Gives the investor an ONCHAINID with a valid KYC claim — the same path
    // production takes on KYC approval.
    await new OnchainidClaimIssuer(prisma, config).issueKycApprovedClaim(INVESTOR);

    const { tokenAddress: deployed } = await new TrexAssetTokenDeployer(config).deployAssetToken({
      assetId: "asset-issuer-test",
      name: "Issuer Test SPV",
      symbol: "ITS",
    });
    tokenAddress = deployed;
    issuer = new TrexAssetTokenIssuer(prisma, config);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mints_to_a_derived_custodial_wallet_and_enables_transfers", async () => {
    await issuer.mint(tokenAddress, INVESTOR, 42n);
    await issuer.mint(tokenAddress, INVESTOR, 8n);
    await issuer.finalize(tokenAddress);

    const wallet = await issuer.walletAddressOf(INVESTOR);
    expect(wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const token = new Contract(
      tokenAddress,
      [
        "function balanceOf(address) view returns (uint256)",
        "function paused() view returns (bool)",
      ],
      provider,
    ) as Contract & { balanceOf(a: string): Promise<bigint>; paused(): Promise<boolean> };
    expect(await token.balanceOf(wallet ?? "")).toBe(50n);
    expect(await token.paused()).toBe(false);
  });
});
