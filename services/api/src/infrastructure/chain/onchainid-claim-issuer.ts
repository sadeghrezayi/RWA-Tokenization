import {
  AbiCoder,
  Contract,
  ContractFactory,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  getBytes,
  hexlify,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import type { ContractTransactionResponse } from "ethers";
import identityArtifact from "@onchain-id/solidity/artifacts/contracts/Identity.sol/Identity.json";
import type { PrismaClient } from "@prisma/client";
import type { ClaimIssuer } from "../../application/identity/ports.js";

// ERC-735 claim constants for the platform's KYC claim (FR-ID-3).
export const CLAIM_TOPIC_KYC = 1n;
export const CLAIM_SCHEME_ECDSA = 1n;
export const KYC_CLAIM_DATA = hexlify(toUtf8Bytes("KYC_APPROVED"));

export interface OnchainidConfig {
  rpcUrl: string;
  // Walking skeleton: one platform key acts as identity management key AND
  // claim signing key. Key separation/rotation is FR-ID-7 (later step).
  operatorMnemonic: string;
  claimIssuerAddress: string;
}

interface IdentityContract {
  addClaim(
    topic: bigint,
    scheme: bigint,
    issuer: string,
    signature: string,
    data: string,
    uri: string,
  ): Promise<ContractTransactionResponse>;
}

// Issues the KYC-approved claim onto the investor's ONCHAINID identity on the
// devnet. Deploys an identity on first use and records the mapping in the
// adapter-owned onchain_identities table.
export class OnchainidClaimIssuer implements ClaimIssuer {
  private readonly signer: HDNodeWallet;
  // Local nonce tracking: ethers briefly caches identical RPC reads, which can
  // reuse a nonce when transactions follow each other quickly (anvil automine).
  private readonly txSigner: NonceManager;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: OnchainidConfig,
  ) {
    const provider = new JsonRpcProvider(config.rpcUrl);
    this.signer = HDNodeWallet.fromPhrase(config.operatorMnemonic).connect(provider);
    this.txSigner = new NonceManager(this.signer);
  }

  async issueKycApprovedClaim(investorId: string): Promise<void> {
    const identityAddress = await this.ensureIdentity(investorId);
    const signature = await this.signClaim(identityAddress);

    const identity = new Contract(
      identityAddress,
      identityArtifact.abi,
      this.txSigner,
    ) as unknown as IdentityContract;
    const tx = await identity.addClaim(
      CLAIM_TOPIC_KYC,
      CLAIM_SCHEME_ECDSA,
      this.config.claimIssuerAddress,
      signature,
      KYC_CLAIM_DATA,
      "",
    );
    await tx.wait();
  }

  private async ensureIdentity(investorId: string): Promise<string> {
    const existing = await this.prisma.onchainIdentity.findFirst({ where: { investorId } });
    if (existing) {
      return existing.address;
    }

    const factory = new ContractFactory(
      identityArtifact.abi,
      identityArtifact.bytecode,
      this.txSigner,
    );
    const deployed = await factory.deploy(this.signer.address, false);
    await deployed.waitForDeployment();
    const address = await deployed.getAddress();

    await this.prisma.onchainIdentity.create({ data: { investorId, address } });
    return address;
  }

  // ERC-735 claim signature: sign keccak(identity, topic, data) as an Ethereum
  // signed message; the ClaimIssuer contract recovers and checks key purpose.
  private signClaim(identityAddress: string): Promise<string> {
    const dataHash = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes"],
        [identityAddress, CLAIM_TOPIC_KYC, KYC_CLAIM_DATA],
      ),
    );
    return this.signer.signMessage(getBytes(dataHash));
  }
}
