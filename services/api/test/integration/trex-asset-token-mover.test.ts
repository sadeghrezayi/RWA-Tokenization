import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ContractFactory, HDNodeWallet, JsonRpcProvider } from "ethers";
import claimIssuerArtifact from "@onchain-id/solidity/artifacts/contracts/ClaimIssuer.sol/ClaimIssuer.json";
import { PrismaClient } from "@prisma/client";
import { OnchainidClaimIssuer } from "../../src/infrastructure/chain/onchainid-claim-issuer.js";
import { TrexAssetTokenDeployer } from "../../src/infrastructure/chain/trex-asset-token-deployer.js";
import { TrexAssetTokenIssuer } from "../../src/infrastructure/chain/trex-asset-token-issuer.js";
import { TrexAssetTokenMover } from "../../src/infrastructure/chain/trex-asset-token-mover.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";
const ALICE = "mover-alice";
const BOB = "mover-bob";
const CAROL = "mover-carol"; // deliberately NOT KYC'd — no on-chain identity

const prisma = new PrismaClient();

// FR-TR-1 on a real devnet: a compliant transfer between two verified holders
// succeeds AND a transfer to an unverified wallet is rejected BY THE TOKEN
// (PRD §14 golden-path step 6), plus the redemption burn (step 7's engine).
describe("TrexAssetTokenMover (integration, anvil devnet)", () => {
  let mover: TrexAssetTokenMover;
  let tokenAddress: string;

  beforeAll(async () => {
    const provider = new JsonRpcProvider(RPC_URL);
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

    for (const id of [ALICE, BOB, CAROL]) {
      await prisma.onchainIdentity.deleteMany({ where: { investorId: id } });
      await prisma.investorWallet.deleteMany({ where: { investorId: id } });
      await prisma.investor.upsert({
        where: { id },
        create: {
          id,
          email: `${id}@example.com`,
          passwordHash: "x",
          kycState: id === CAROL ? "draft" : "approved",
        },
        update: {},
      });
    }
    // KYC identities + claims for alice and bob only.
    const onchainId = new OnchainidClaimIssuer(prisma, config);
    await onchainId.issueKycApprovedClaim(ALICE);
    await onchainId.issueKycApprovedClaim(BOB);

    const { tokenAddress: deployed } = await new TrexAssetTokenDeployer(config).deployAssetToken({
      assetId: "asset-mover-test",
      name: "Mover Test SPV",
      symbol: "MTS",
    });
    tokenAddress = deployed;

    // Alice starts with 50 tokens (this also unpauses the token).
    const issuer = new TrexAssetTokenIssuer(prisma, config);
    await issuer.mint(tokenAddress, ALICE, 50n);
    await issuer.finalize(tokenAddress);

    mover = new TrexAssetTokenMover(prisma, config);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("transfers_between_two_verified_holders_via_the_regular_erc3643_path", async () => {
    await mover.transfer(tokenAddress, ALICE, BOB, 20n);

    expect(await mover.balanceOf(tokenAddress, ALICE)).toBe(30n);
    expect(await mover.balanceOf(tokenAddress, BOB)).toBe(20n);
  });

  it("rejects_a_transfer_to_an_unverified_recipient_on_chain", async () => {
    await expect(mover.transfer(tokenAddress, ALICE, CAROL, 5n)).rejects.toThrow();

    // Nothing moved: alice keeps her balance, carol has none.
    expect(await mover.balanceOf(tokenAddress, ALICE)).toBe(30n);
    expect(await mover.balanceOf(tokenAddress, CAROL)).toBe(0n);
  });

  it("burns_redeemed_tokens_as_the_agent", async () => {
    await mover.burn(tokenAddress, ALICE, 10n);
    expect(await mover.balanceOf(tokenAddress, ALICE)).toBe(20n);
  });

  it("reports_zero_balance_for_an_investor_without_a_wallet", async () => {
    expect(await mover.balanceOf(tokenAddress, "never-seen")).toBe(0n);
  });
});
