import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApproveAsset } from "../../application/assets/approve-asset.js";
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
import { CurrentPrincipal, RequireRole } from "./auth.guard.js";

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
@RequireRole("officer")
export class AssetsController {
  constructor(
    private readonly proposeAsset: ProposeAsset,
    private readonly startStructuring: StartStructuring,
    private readonly attachDocument: AttachDossierDocument,
    private readonly recordCustody: RecordCustody,
    private readonly confirmChecklistItem: ConfirmChecklistItem,
    private readonly approveAsset: ApproveAsset,
    private readonly tokenizeAsset: TokenizeAsset,
    private readonly getAsset: GetAsset,
    private readonly listAssets: ListAssets,
  ) {}

  @Post()
  propose(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ assetId: string }> {
    return this.proposeAsset.execute({
      name: requireString(body, "name"),
      actor: actorOf(principal),
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
