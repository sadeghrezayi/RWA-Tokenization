import type { Attestation as AttestationRow, PrismaClient } from "@prisma/client";
import { Attestation } from "../../domain/attestations/attestation.js";
import type { AttestationRepository } from "../../application/attestations/ports.js";

export class PrismaAttestationRepository implements AttestationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Attestation | undefined> {
    const row = await this.prisma.attestation.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByAsset(assetId: string): Promise<Attestation[]> {
    const rows = await this.prisma.attestation.findMany({
      where: { assetId },
      orderBy: { issuedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findLatest(assetId: string, kind: string): Promise<Attestation | undefined> {
    const row = await this.prisma.attestation.findFirst({
      where: { assetId, kind: kind as AttestationRow["kind"] },
      orderBy: { issuedAt: "desc" },
    });
    return row ? toDomain(row) : undefined;
  }

  async save(attestation: Attestation): Promise<void> {
    const data = {
      assetId: attestation.assetId,
      kind: attestation.kind,
      valueRial: attestation.valueRial,
      attestorId: attestation.attestorId,
      issuedAt: attestation.issuedAt,
      validUntil: attestation.validUntil,
      payloadHash: attestation.payloadHash,
      signature: attestation.signature,
      documentCid: attestation.documentCid ?? null,
    };
    await this.prisma.attestation.upsert({
      where: { id: attestation.id },
      create: { id: attestation.id, ...data },
      update: data,
    });
  }
}

const toDomain = (row: AttestationRow): Attestation =>
  Attestation.issue({
    id: row.id,
    assetId: row.assetId,
    kind: row.kind,
    valueRial: row.valueRial,
    attestorId: row.attestorId,
    issuedAt: row.issuedAt,
    validUntil: row.validUntil,
    payloadHash: row.payloadHash,
    signature: row.signature,
    ...(row.documentCid !== null ? { documentCid: row.documentCid } : {}),
  });
