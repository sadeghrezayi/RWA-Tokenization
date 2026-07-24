import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Attestation } from "../../domain/attestations/attestation.js";
import type { AttestationKind } from "../../domain/attestations/attestation.js";
import { PublishAttestation } from "../../application/attestations/publish-attestation.js";
import {
  GetLatestAttestation,
  ListAttestations,
} from "../../application/attestations/get-attestation.js";
import type { AttestationView } from "../../application/attestations/get-attestation.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

const requireKind = (value: unknown): AttestationKind => {
  if (typeof value !== "string" || !(Attestation.KINDS as readonly string[]).includes(value)) {
    throw new BadRequestException(`"kind" must be one of ${Attestation.KINDS.join(", ")}`);
  }
  return value as AttestationKind;
};

const requireBigInt = (value: unknown, field: string): bigint => {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new BadRequestException(`"${field}" is required (integer as a string)`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new BadRequestException(`"${field}" must be an integer`);
  }
};

const requireIsoDate = (value: unknown, field: string): Date => {
  const date = typeof value === "string" ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${field}" must be an ISO-8601 date string`);
  }
  return date;
};

// FR-OR endpoints — operator/attestor publishes signed facts; reads expose the
// latest value and the full history. Own /attestations resource (no /assets/:id
// route collision).
@Controller("attestations")
@RequirePermission(PERMISSIONS.ATTESTATION_PUBLISH)
export class AttestationsController {
  constructor(
    private readonly publishAttestation: PublishAttestation,
    private readonly getLatest: GetLatestAttestation,
    private readonly listAttestations: ListAttestations,
  ) {}

  @Post()
  publish(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ attestationId: string; payloadHash: string }> {
    const b = body as Record<string, unknown> | null;
    const documentCid = b?.documentCid;
    return this.publishAttestation.execute({
      assetId: requireString(b?.assetId, "assetId"),
      kind: requireKind(b?.kind),
      valueRial: requireBigInt(b?.valueRial, "valueRial"),
      validUntil: requireIsoDate(b?.validUntil, "validUntil"),
      ...(typeof documentCid === "string" && documentCid !== "" ? { documentCid } : {}),
      actor: principal.kind === "officer" ? principal.officerId : principal.investorId,
    });
  }

  @Get()
  list(@Query("assetId") assetId: string): Promise<AttestationView[]> {
    return this.listAttestations.execute({ assetId: requireString(assetId, "assetId") });
  }

  // Wrapped so "no attestation yet" is an explicit JSON null, not an empty body.
  @Get("latest")
  async latest(
    @Query("assetId") assetId: string,
    @Query("kind") kind: string,
  ): Promise<{ latest: AttestationView | null }> {
    const view = await this.getLatest.execute({
      assetId: requireString(assetId, "assetId"),
      kind: requireKind(kind),
    });
    return { latest: view ?? null };
  }
}
