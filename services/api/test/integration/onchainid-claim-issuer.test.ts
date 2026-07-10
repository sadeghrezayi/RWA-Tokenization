import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AbiCoder,
  Contract,
  ContractFactory,
  HDNodeWallet,
  JsonRpcProvider,
  keccak256,
} from "ethers";
import claimIssuerArtifact from "@onchain-id/solidity/artifacts/contracts/ClaimIssuer.sol/ClaimIssuer.json";
import identityArtifact from "@onchain-id/solidity/artifacts/contracts/Identity.sol/Identity.json";
import { PrismaClient } from "@prisma/client";
import {
  CLAIM_TOPIC_KYC,
  OnchainidClaimIssuer,
} from "../../src/infrastructure/chain/onchainid-claim-issuer.js";

// Requires a running anvil devnet (pnpm devnet) — well-known anvil test mnemonic.
const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";

interface ClaimIssuerContract {
  isClaimValid(identity: string, claimTopic: bigint, sig: string, data: string): Promise<boolean>;
}

interface IdentityReadContract {
  getClaim(claimId: string): Promise<[bigint, bigint, string, string, string, string]>;
}

const prisma = new PrismaClient();

describe("OnchainidClaimIssuer (integration, anvil devnet)", () => {
  let claimIssuerAddress: string;
  let adapter: OnchainidClaimIssuer;
  let signer: HDNodeWallet;

  beforeAll(async () => {
    signer = HDNodeWallet.fromPhrase(MNEMONIC).connect(new JsonRpcProvider(RPC_URL));
    const factory = new ContractFactory(
      claimIssuerArtifact.abi,
      claimIssuerArtifact.bytecode,
      signer,
    );
    const deployed = await factory.deploy(signer.address);
    await deployed.waitForDeployment();
    claimIssuerAddress = await deployed.getAddress();
    adapter = new OnchainidClaimIssuer(prisma, {
      rpcUrl: RPC_URL,
      operatorMnemonic: MNEMONIC,
      claimIssuerAddress,
    });
  });

  beforeEach(async () => {
    await prisma.onchainIdentity.deleteMany();
    await prisma.investor.deleteMany();
    await prisma.investor.create({
      data: { id: "inv-chain-1", email: "chain@example.com", kycState: "approved" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deploys_an_identity_records_the_mapping_and_issues_a_valid_claim", async () => {
    await adapter.issueKycApprovedClaim("inv-chain-1");

    const mapping = await prisma.onchainIdentity.findUnique({
      where: { investorId: "inv-chain-1" },
    });
    expect(mapping?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    if (!mapping) throw new Error("unreachable: asserted above");

    const identity = new Contract(
      mapping.address,
      identityArtifact.abi,
      signer,
    ) as unknown as IdentityReadContract;
    const claimId = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [claimIssuerAddress, CLAIM_TOPIC_KYC],
      ),
    );
    const [topic, , issuer, signature, data] = await identity.getClaim(claimId);
    expect(topic).toBe(CLAIM_TOPIC_KYC);
    expect(issuer).toBe(claimIssuerAddress);

    const claimIssuer = new Contract(
      claimIssuerAddress,
      claimIssuerArtifact.abi,
      signer,
    ) as unknown as ClaimIssuerContract;
    expect(await claimIssuer.isClaimValid(mapping.address, CLAIM_TOPIC_KYC, signature, data)).toBe(
      true,
    );
  });

  it("reuses_the_existing_identity_on_repeat_issuance", async () => {
    await adapter.issueKycApprovedClaim("inv-chain-1");
    const first = await prisma.onchainIdentity.findUnique({ where: { investorId: "inv-chain-1" } });

    await adapter.issueKycApprovedClaim("inv-chain-1");
    const second = await prisma.onchainIdentity.findUnique({
      where: { investorId: "inv-chain-1" },
    });

    expect(second?.address).toBe(first?.address);
  });
});
