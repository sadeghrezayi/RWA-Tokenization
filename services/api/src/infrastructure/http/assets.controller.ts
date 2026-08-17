import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import { ApproveAsset } from "../../application/assets/approve-asset.js";
import { SetDocumentVisibility } from "../../application/assets/set-document-visibility.js";
import { RecordRealEstateProfile } from "../../application/assets/record-real-estate-profile.js";
import { SetConveyedRight } from "../../application/assets/set-conveyed-right.js";
import { PROPERTY_TYPES } from "../../domain/assets/real-estate-profile.js";
import type { PropertyType } from "../../domain/assets/real-estate-profile.js";
import { TokenizeAsset } from "../../application/assets/tokenize-asset.js";
import { AttachDossierDocument } from "../../application/assets/attach-dossier-document.js";
import { ConfirmChecklistItem } from "../../application/assets/confirm-checklist-item.js";
import { GetAsset, ListAssets } from "../../application/assets/get-asset.js";
import type { AssetView } from "../../application/assets/get-asset.js";
import { ProposeAsset } from "../../application/assets/propose-asset.js";
import { RecordCustody } from "../../application/assets/record-custody.js";
import { StartStructuring } from "../../application/assets/start-structuring.js";
import { REQUIRED_DOSSIER_KINDS } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../domain/assets/onboarding-checklist.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

const asDocumentKind = (raw: string): DossierDocumentKind => {
  if (!(REQUIRED_DOSSIER_KINDS as readonly string[]).includes(raw)) {
    throw new BadRequestException(`"kind" must be one of: ${REQUIRED_DOSSIER_KINDS.join(", ")}`);
  }
  return raw as DossierDocumentKind;
};

const asChecklistItem = (raw: string): ChecklistItem => {
  if (!(CHECKLIST_ITEMS as readonly string[]).includes(raw)) {
    throw new BadRequestException(`unknown checklist item "${raw}"`);
  }
  return raw as ChecklistItem;
};

const actorOf = (principal: Principal): string =>
  principal.kind === "officer" ? principal.officerId : principal.investorId;

// FR-AO endpoints. Gated to the staff account (acting operator — see PRD §5
// role seams; per-officer accounts arrive with the FR-RA-2 audit log).
@Controller("assets")
@RequirePermission(PERMISSIONS.ASSET_MANAGE)
export class AssetsController {
  constructor(
    private readonly proposeAsset: ProposeAsset,
    private readonly startStructuring: StartStructuring,
    private readonly attachDocument: AttachDossierDocument,
    private readonly recordCustody: RecordCustody,
    private readonly confirmChecklistItem: ConfirmChecklistItem,
    private readonly approveAsset: ApproveAsset,
    private readonly setDocumentVisibility: SetDocumentVisibility,
    private readonly recordRealEstate: RecordRealEstateProfile,
    private readonly setConveyedRight: SetConveyedRight,
    private readonly tokenizeAsset: TokenizeAsset,
    private readonly getAsset: GetAsset,
    private readonly listAssets: ListAssets,
  ) {}

  // 3.3: an asset may be brought by an approved issuer. Omitting the
  // organisation is not an oversight — the platform onboards assets itself.
  @Post()
  propose(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ assetId: string }> {
    const organisationId = (body as { organisationId?: unknown } | null | undefined)
      ?.organisationId;
    if (organisationId !== undefined && typeof organisationId !== "string") {
      throw new BadRequestException('"organisationId" must be a string when given');
    }
    return this.proposeAsset.execute({
      name: requireString(body, "name"),
      actor: actorOf(principal),
      ...(typeof organisationId === "string" ? { organisationId } : {}),
    });
  }

  @Get()
  list(): Promise<AssetView[]> {
    return this.listAssets.execute();
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<AssetView> {
    return this.getAsset.execute({ assetId: id });
  }

  @Post(":id/start-structuring")
  @HttpCode(204)
  start(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.startStructuring.execute({ assetId: id, actor: actorOf(principal) });
  }

  @Post(":id/documents")
  attach(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ cid: string; sha256: string }> {
    return this.attachDocument.execute({
      assetId: id,
      kind: asDocumentKind(requireString(body, "kind")),
      title: requireString(body, "title"),
      contentBase64: requireString(body, "contentBase64"),
      actor: actorOf(principal),
    });
  }

  // 2.5d: the disclosure switch. Deliberately separate from attaching a
  // document — the contents are frozen after approval, the decision is not.
  @Post(":id/documents/:kind/visibility")
  @HttpCode(204)
  visibility(
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    const visible = (body as { visible?: unknown } | null | undefined)?.visible;
    if (typeof visible !== "boolean") {
      throw new BadRequestException('"visible" is required and must be a boolean');
    }
    return this.setDocumentVisibility.execute({
      assetId: id,
      kind: asDocumentKind(kind),
      visible,
      actor: actorOf(principal),
    });
  }

  // 3.1: the property this token is issued against.
  @Post(":id/real-estate")
  @HttpCode(204)
  realEstate(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    const fields = body as Record<string, unknown> | null | undefined;
    const propertyType = requireString(body, "propertyType");
    if (!(PROPERTY_TYPES as readonly string[]).includes(propertyType)) {
      throw new BadRequestException(`"propertyType" must be one of: ${PROPERTY_TYPES.join(", ")}`);
    }
    const area = fields?.areaSquareMetres;
    if (typeof area !== "number") {
      throw new BadRequestException('"areaSquareMetres" is required and must be a number');
    }
    const builtInYear = fields?.builtInYear;
    if (builtInYear !== undefined && typeof builtInYear !== "number") {
      throw new BadRequestException('"builtInYear" must be a number when given');
    }
    return this.recordRealEstate.execute({
      assetId: id,
      addressLine: requireString(body, "addressLine"),
      city: requireString(body, "city"),
      propertyType: propertyType as PropertyType,
      areaSquareMetres: area,
      titleReference: requireString(body, "titleReference"),
      ...(typeof builtInYear === "number" ? { builtInYear } : {}),
      actor: actorOf(principal),
    });
  }

  // 3.1: what the token conveys. POST states a right in the wording it was
  // granted in; DELETE withdraws it. Both are audited.
  @Post(":id/rights/:kind")
  @HttpCode(204)
  conveyRight(
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.setConveyedRight.execute({
      assetId: id,
      kind,
      note: requireString(body, "note"),
      actor: actorOf(principal),
    });
  }

  @Delete(":id/rights/:kind")
  @HttpCode(204)
  withdrawRight(
    @Param("id") id: string,
    @Param("kind") kind: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.setConveyedRight.execute({ assetId: id, kind, actor: actorOf(principal) });
  }

  @Post(":id/custody")
  @HttpCode(204)
  custody(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.recordCustody.execute({
      assetId: id,
      custodianName: requireString(body, "custodianName"),
      location: requireString(body, "location"),
      actor: actorOf(principal),
    });
  }

  @Post(":id/checklist/:item")
  @HttpCode(204)
  confirm(
    @Param("id") id: string,
    @Param("item") item: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.confirmChecklistItem.execute({
      assetId: id,
      item: asChecklistItem(item),
      actor: actorOf(principal),
    });
  }

  @Post(":id/approve")
  @HttpCode(204)
  approve(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.approveAsset.execute({ assetId: id, actor: actorOf(principal) });
  }

  @Post(":id/tokenize")
  tokenize(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ tokenAddress: string }> {
    return this.tokenizeAsset.execute({
      assetId: id,
      symbol: requireString(body, "symbol"),
      actor: actorOf(principal),
    });
  }
}
