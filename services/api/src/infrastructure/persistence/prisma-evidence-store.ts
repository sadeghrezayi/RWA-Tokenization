import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { isOnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import type { Clock } from "../../application/offerings/ports.js";
import type {
  EvidenceContent,
  EvidenceDescriptor,
  EvidenceStore,
} from "../../application/onboarding/ports.js";

// Prisma types a Bytes column as Uint8Array<ArrayBuffer>; a Node Buffer is a
// Uint8Array over ArrayBufferLike, so the bytes are copied into a plain one.
const toBytes = (buffer: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(buffer);

export class CorruptEvidenceRowError extends Error {
  constructor(reference: string, detail: string) {
    super(`evidence ${reference} is not readable: ${detail}`);
    this.name = "CorruptEvidenceRowError";
  }
}

// Only the columns a listing needs. Naming them explicitly is the guarantee
// that `listFor` cannot accidentally pull ciphertext across the wire.
const METADATA_COLUMNS = {
  reference: true,
  investorId: true,
  step: true,
  filename: true,
  contentType: true,
  byteSize: true,
  uploadedAt: true,
} as const;

interface MetadataRow {
  reference: string;
  investorId: string;
  step: string;
  filename: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
}

// 2.3b: identity evidence in a private table, encrypted at rest — deliberately
// NOT IPFS.
//
// IPFS is content-addressed and effectively permanent: anyone holding the CID
// could fetch a passport scan, and an erasure request could not be honoured.
// A private table gives both properties a personal-data store must have —
// access is mediated by this process, and `erase` genuinely removes the bytes.
//
// The plaintext never reaches the database: `content` holds the AES-256-GCM
// sealed blob, and `byteSize` records the original document's size so a UI can
// show something the applicant recognizes without decrypting anything.
export class PrismaEvidenceStore implements EvidenceStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: {
      encrypt(plaintext: Buffer): Buffer;
      decrypt(sealed: Buffer): Buffer;
    },
    private readonly clock: Clock,
  ) {}

  async put(input: {
    investorId: string;
    step: OnboardingStep;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<EvidenceDescriptor> {
    const descriptor: EvidenceDescriptor = {
      reference: randomUUID(),
      investorId: input.investorId,
      step: input.step,
      filename: input.filename,
      contentType: input.contentType,
      byteSize: input.bytes.length,
      uploadedAt: this.clock.now(),
    };

    await this.prisma.kycEvidence.create({
      data: { ...descriptor, content: toBytes(this.cipher.encrypt(input.bytes)) },
    });

    return descriptor;
  }

  async listFor(investorId: string): Promise<EvidenceDescriptor[]> {
    const rows = await this.prisma.kycEvidence.findMany({
      where: { investorId },
      select: METADATA_COLUMNS,
      orderBy: { uploadedAt: "asc" },
    });
    return rows.map((row) => this.toDescriptor(row));
  }

  async fetch(reference: string): Promise<EvidenceContent | undefined> {
    // findFirst, not findUnique: the tenant-scoped client rejects unique-input
    // operations it cannot scope.
    const row = await this.prisma.kycEvidence.findFirst({ where: { reference } });
    if (!row) {
      return undefined;
    }
    // decrypt() throws if the authentication tag does not verify — a document
    // altered at rest must surface as an error, never as content a reviewer
    // might act on.
    return {
      descriptor: this.toDescriptor(row),
      bytes: this.cipher.decrypt(Buffer.from(row.content)),
    };
  }

  async erase(reference: string): Promise<boolean> {
    const { count } = await this.prisma.kycEvidence.deleteMany({ where: { reference } });
    return count > 0;
  }

  private toDescriptor(row: MetadataRow): EvidenceDescriptor {
    if (!isOnboardingStep(row.step)) {
      // Written only by this adapter from a typed value, so an unrecognized
      // step means the data was altered underneath us — say so rather than
      // coercing it into something plausible.
      throw new CorruptEvidenceRowError(row.reference, `unknown step "${row.step}"`);
    }
    return {
      reference: row.reference,
      investorId: row.investorId,
      step: row.step,
      filename: row.filename,
      contentType: row.contentType,
      byteSize: row.byteSize,
      uploadedAt: row.uploadedAt,
    };
  }
}
