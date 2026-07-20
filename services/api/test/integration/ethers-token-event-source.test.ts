import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ContractFactory, HDNodeWallet, JsonRpcProvider } from "ethers";
import claimIssuerArtifact from "@onchain-id/solidity/artifacts/contracts/ClaimIssuer.sol/ClaimIssuer.json";
import { PrismaClient } from "@prisma/client";
import { OnchainidClaimIssuer } from "../../src/infrastructure/chain/onchainid-claim-issuer.js";
import { TrexAssetTokenDeployer } from "../../src/infrastructure/chain/trex-asset-token-deployer.js";
import { TrexAssetTokenIssuer } from "../../src/infrastructure/chain/trex-asset-token-issuer.js";
import { TrexAssetTokenMover } from "../../src/infrastructure/chain/trex-asset-token-mover.js";
import { EthersTokenEventSource } from "../../src/infrastructure/chain/ethers-token-event-source.js";
import { HolderRegistry } from "../../src/domain/registry/holder-registry.js";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";
const ALICE = "evsrc-alice";
const BOB = "evsrc-bob";

const prisma = new PrismaClient();

// FR-RA-1 / §14 step 8 at the adapter level: after real mint + transfer +
// burn on the devnet, the registry rebuilt from the chain's own event log
// matches balanceOf and totalSupply exactly.
describe("EthersTokenEventSource (integration, anvil devnet)", () => {
  let source: EthersTokenEventSource;
  let mover: TrexAssetTokenMover;
  let tokenAddress: string;
  let aliceWallet: string;
  let bobWallet: string;

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

    for (const id of [ALICE, BOB]) {
      await prisma.onchainIdentity.deleteMany({ where: { investorId: id } });
      await prisma.investorWallet.deleteMany({ where: { investorId: id } });
      await prisma.investor.upsert({
        where: { id },
        create: { id, email: `${id}@example.com`, passwordHash: "x", kycState: "approved" },
        update: {},
      });
    }
    const onchainId = new OnchainidClaimIssuer(prisma, config);
    await onchainId.issueKycApprovedClaim(ALICE);
    await onchainId.issueKycApprovedClaim(BOB);

    const { tokenAddress: deployed } = await new TrexAssetTokenDeployer(config).deployAssetToken({
      assetId: "asset-evsrc-test",
      name: "Event Source SPV",
      symbol: "EVS",
    });
    tokenAddress = deployed;

    const issuer = new TrexAssetTokenIssuer(prisma, config);
    await issuer.mint(tokenAddress, ALICE, 50n);
    await issuer.finalize(tokenAddress);
    mover = new TrexAssetTokenMover(prisma, config);
    await mover.transfer(tokenAddress, ALICE, BOB, 20n);
    await mover.burn(tokenAddress, ALICE, 10n);

    const wallets = await prisma.investorWallet.findMany({
      where: { investorId: { in: [ALICE, BOB] } },
    });
    aliceWallet = wallets.find((w) => w.investorId === ALICE)?.address ?? "";
    bobWallet = wallets.find((w) => w.investorId === BOB)?.address ?? "";

    source = new EthersTokenEventSource(RPC_URL);
  }, 90_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("classifies_the_full_transfer_log_in_chain_order", async () => {
    const events = await source.registryEvents(tokenAddress);

    expect(events.map((e) => e.kind)).toEqual(["mint", "transfer", "burn"]);
    expect(events[0]).toMatchObject({ kind: "mint", to: aliceWallet, tokens: 50n });
    expect(events[1]).toMatchObject({
      kind: "transfer",
      from: aliceWallet,
      to: bobWallet,
      tokens: 20n,
    });
    expect(events[2]).toMatchObject({ kind: "burn", from: aliceWallet, tokens: 10n });
    for (const event of events) {
      expect(event.ref).toMatch(/^0x[0-9a-f]{64}$/);
      expect(event.at.getTime()).toBeGreaterThan(0);
    }
  });

  it("reads_the_live_total_supply", async () => {
    expect(await source.totalSupply(tokenAddress)).toBe(40n);
  });

  it("reconstructs_a_registry_that_matches_balanceOf_and_totalSupply_exactly", async () => {
    const registry = HolderRegistry.fromEvents(await source.registryEvents(tokenAddress));

    const positions = new Map(registry.holders.map((h) => [h.holder, h.tokens]));
    expect(positions.get(aliceWallet)).toBe(await mover.balanceOf(tokenAddress, ALICE));
    expect(positions.get(bobWallet)).toBe(await mover.balanceOf(tokenAddress, BOB));
    expect(registry.reconcile(await source.totalSupply(tokenAddress)).matches).toBe(true);
  });
});
