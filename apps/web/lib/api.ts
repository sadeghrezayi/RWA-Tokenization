export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

export interface InvestorViewDto {
  id: string;
  email: string;
  kycState: KycState;
  kycRejectionReason?: string;
  eligibleForClaims: boolean;
}

export type AssetState =
  "proposed" | "in_structuring" | "approved" | "tokenized" | "suspended" | "retired";

export interface AssetViewDto {
  id: string;
  name: string;
  type: string;
  state: AssetState;
  tokenAddress?: string;
  custody?: { custodianName: string; location: string };
  checklist: { confirmed: string[]; unconfirmed: string[] };
  dossier: {
    complete: boolean;
    missingKinds: string[];
    documents: { kind: string; title: string; cid: string; sha256: string }[];
  };
}

export interface OfferingSummaryDto {
  id: string;
  state: string;
  supply: string;
  subscribed: string;
  priceRial: string;
}

export interface DistributionSummaryDto {
  id: string;
  state: string;
  totalAmountRial: string;
}

export interface LatestValuationDto {
  valueRial: string;
  asOf: string;
  validUntil: string;
  fresh: boolean;
}

export interface AttestationViewDto {
  id: string;
  assetId: string;
  kind: string;
  valueRial: string;
  attestorId: string;
  asOf: string;
  validUntil: string;
  payloadHash: string;
  documentCid?: string;
  fresh: boolean;
}

export interface AssetOverviewDto {
  id: string;
  name: string;
  state: AssetState;
  tokenAddress?: string;
  circulatingSupply: string;
  holderCount: number;
  totalRaisedRial: string;
  totalDistributedRial: string;
  offerings: OfferingSummaryDto[];
  distributions: DistributionSummaryDto[];
  latestValuation?: LatestValuationDto;
}

export interface PortfolioOverviewDto {
  assets: AssetOverviewDto[];
  summary: {
    assetCount: number;
    tokenizedCount: number;
    totalRaisedRial: string;
    totalDistributedRial: string;
  };
}

export interface SystemHealthDto {
  overall: "healthy" | "degraded";
  services: { api: string; postgres: string; ipfs: string; chain: string };
  chainBlockNumber?: number;
  pausedTokens: number;
}

export interface HoldingDto {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  tokens: string;
}

export interface RedemptionDto {
  id: string;
  assetId: string;
  tokenAddress: string;
  investorId: string;
  tokens: string;
  state: "requested" | "fulfilled" | "rejected";
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
  resolvedAt?: string;
}

export interface RegistryHolderDto {
  wallet: string;
  tokens: string;
  since: string;
  shareBps: number;
  investorId?: string;
  email?: string;
}

export interface RegistryEventDto {
  kind: "mint" | "transfer" | "burn";
  tokens: string;
  at: string;
  ref: string;
  from?: string;
  to?: string;
}

export interface HolderRegistryDto {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  holders: RegistryHolderDto[];
  registryTotal: string;
  onChainSupply: string;
  matchesChain: boolean;
  history: RegistryEventDto[];
}

export interface AuditEventDto {
  id: string;
  assetId: string;
  assetName: string;
  event: string;
  actor: string;
  details: Record<string, string>;
  at: string;
}

export interface CsvDownloadDto {
  filename: string;
  csv: string;
}

export interface InvestorDirectoryEntryDto extends InvestorViewDto {
  balanceRial: string;
  heldRial: string;
}

export interface InvestorTransferItemDto {
  id: string;
  direction: "sent" | "received";
  counterparty: string;
  assetName: string;
  tokens: string;
  at: string;
}

export interface InvestorRedemptionItemDto {
  id: string;
  assetName: string;
  tokens: string;
  state: "requested" | "fulfilled" | "rejected";
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
}

export interface InvestorDetailDto {
  investor: InvestorViewDto;
  chain: { identityAddress?: string; walletAddress?: string };
  ledger: { balanceRial: string; heldRial: string };
  holdings: HoldingDto[];
  transfers: InvestorTransferItemDto[];
  redemptions: InvestorRedemptionItemDto[];
}

export interface ApiClient {
  register(email: string, password: string): Promise<{ investorId: string }>;
  login(email: string, password: string): Promise<{ token: string; investorId: string }>;
  officerLogin(email: string, password: string): Promise<{ token: string }>;
  me(token: string): Promise<InvestorViewDto>;
  submitKyc(token: string): Promise<void>;
  pendingKyc(officerToken: string): Promise<InvestorViewDto[]>;
  startReview(officerToken: string, investorId: string): Promise<void>;
  approve(officerToken: string, investorId: string): Promise<void>;
  reject(officerToken: string, investorId: string, reason: string): Promise<void>;
  listAssets(officerToken: string): Promise<AssetViewDto[]>;
  proposeAsset(officerToken: string, name: string): Promise<{ assetId: string }>;
  startStructuring(officerToken: string, assetId: string): Promise<void>;
  attachAssetDocument(
    officerToken: string,
    assetId: string,
    doc: { kind: string; title: string; contentBase64: string },
  ): Promise<{ cid: string; sha256: string }>;
  recordCustody(
    officerToken: string,
    assetId: string,
    custody: { custodianName: string; location: string },
  ): Promise<void>;
  confirmChecklistItem(officerToken: string, assetId: string, item: string): Promise<void>;
  approveAsset(officerToken: string, assetId: string): Promise<void>;
  tokenizeAsset(
    officerToken: string,
    assetId: string,
    symbol: string,
  ): Promise<{ tokenAddress: string }>;
  ledgerMe(token: string): Promise<LedgerDto>;
  creditLedger(officerToken: string, investorId: string, amountRial: string): Promise<void>;
  listOfferings(token: string): Promise<OfferingViewDto[]>;
  createOffering(officerToken: string, body: CreateOfferingBody): Promise<{ offeringId: string }>;
  openOffering(officerToken: string, offeringId: string): Promise<void>;
  closeOffering(officerToken: string, offeringId: string): Promise<CloseResultDto>;
  subscribeOffering(token: string, offeringId: string, tokens: string): Promise<void>;
  listDistributions(officerToken: string): Promise<DistributionViewDto[]>;
  assetOverview(officerToken: string): Promise<PortfolioOverviewDto>;
  systemHealth(officerToken: string): Promise<SystemHealthDto>;
  publishAttestation(
    officerToken: string,
    body: {
      assetId: string;
      kind: string;
      valueRial: string;
      validUntil: string;
      documentCid?: string;
    },
  ): Promise<{ attestationId: string; payloadHash: string }>;
  listAttestations(officerToken: string, assetId: string): Promise<AttestationViewDto[]>;
  myHoldings(token: string): Promise<HoldingDto[]>;
  transferTokens(
    token: string,
    body: { assetId: string; toEmail: string; tokens: string },
  ): Promise<{ transferId: string }>;
  requestRedemption(
    token: string,
    body: { assetId: string; tokens: string },
  ): Promise<{ redemptionId: string }>;
  myRedemptions(token: string): Promise<RedemptionDto[]>;
  listRedemptions(officerToken: string): Promise<RedemptionDto[]>;
  fulfillRedemption(officerToken: string, redemptionId: string): Promise<{ payoutRial: string }>;
  rejectRedemption(officerToken: string, redemptionId: string, reason: string): Promise<void>;
  declareDistribution(
    officerToken: string,
    assetId: string,
    totalAmountRial: string,
  ): Promise<{ distributionId: string }>;
  payDistribution(officerToken: string, distributionId: string): Promise<void>;
  holderRegistry(officerToken: string, assetId: string): Promise<HolderRegistryDto>;
  registryCsv(officerToken: string, assetId: string): Promise<CsvDownloadDto>;
  transfersCsv(officerToken: string, assetId: string): Promise<CsvDownloadDto>;
  auditTrail(
    officerToken: string,
    filter?: { assetId?: string; limit?: number },
  ): Promise<AuditEventDto[]>;
  listInvestors(officerToken: string): Promise<InvestorDirectoryEntryDto[]>;
  investorDetail(officerToken: string, investorId: string): Promise<InvestorDetailDto>;
}

export type DistributionStateDto = "declared" | "paid";

export interface DistributionViewDto {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  totalAmountRial: string;
  state: DistributionStateDto;
  payouts: { investorId: string; tokens: string; amountRial: string }[];
  reconciliation: { declared: string; allocated: string; balanced: boolean };
}

export interface LedgerDto {
  balanceRial: string;
  heldRial: string;
}

export type OfferingStateDto = "draft" | "open" | "closed_success" | "closed_failed";

export interface OfferingViewDto {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  opensAt: string;
  closesAt: string;
  state: OfferingStateDto;
  totalSubscribed: string;
  mySubscribed?: string;
  myAllocation?: { requested: string; allocated: string; costRial: string; refundRial: string };
}

export interface CreateOfferingBody {
  assetId: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  opensAt: string;
  closesAt: string;
}

export interface CloseResultDto {
  state: OfferingStateDto;
  allocations: {
    investorId: string;
    requested: string;
    allocated: string;
    costRial: string;
    refundRial: string;
  }[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const createApiClient = (
  baseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
): ApiClient => {
  const call = async (
    path: string,
    init: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<Response> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.token !== undefined ? { authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(res.status, body.message ?? res.statusText);
    }
    return res;
  };

  const json = async <T>(res: Promise<Response>): Promise<T> => (await res).json() as Promise<T>;

  // CSV attachments: body is plain text; the filename travels in the header.
  const csv = async (res: Promise<Response>): Promise<CsvDownloadDto> => {
    const response = await res;
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export.csv";
    return { filename, csv: await response.text() };
  };

  return {
    register: (email, password) =>
      json(call("/investors", { method: "POST", body: { email, password } })),
    login: (email, password) =>
      json(call("/auth/login", { method: "POST", body: { email, password } })),
    officerLogin: (email, password) =>
      json(call("/auth/officer/login", { method: "POST", body: { email, password } })),
    me: (token) => json(call("/investors/me", { token })),
    submitKyc: async (token) => {
      await call("/investors/me/kyc/submit", { method: "POST", token });
    },
    pendingKyc: (officerToken) => json(call("/investors/pending-kyc", { token: officerToken })),
    startReview: async (officerToken, investorId) => {
      await call(`/investors/${investorId}/kyc/start-review`, {
        method: "POST",
        token: officerToken,
      });
    },
    approve: async (officerToken, investorId) => {
      await call(`/investors/${investorId}/kyc/approve`, { method: "POST", token: officerToken });
    },
    reject: async (officerToken, investorId, reason) => {
      await call(`/investors/${investorId}/kyc/reject`, {
        method: "POST",
        token: officerToken,
        body: { reason },
      });
    },
    listAssets: (officerToken) => json(call("/assets", { token: officerToken })),
    proposeAsset: (officerToken, name) =>
      json(call("/assets", { method: "POST", token: officerToken, body: { name } })),
    startStructuring: async (officerToken, assetId) => {
      await call(`/assets/${assetId}/start-structuring`, { method: "POST", token: officerToken });
    },
    attachAssetDocument: (officerToken, assetId, doc) =>
      json(
        call(`/assets/${assetId}/documents`, { method: "POST", token: officerToken, body: doc }),
      ),
    recordCustody: async (officerToken, assetId, custody) => {
      await call(`/assets/${assetId}/custody`, {
        method: "POST",
        token: officerToken,
        body: custody,
      });
    },
    confirmChecklistItem: async (officerToken, assetId, item) => {
      await call(`/assets/${assetId}/checklist/${item}`, { method: "POST", token: officerToken });
    },
    approveAsset: async (officerToken, assetId) => {
      await call(`/assets/${assetId}/approve`, { method: "POST", token: officerToken });
    },
    tokenizeAsset: (officerToken, assetId, symbol) =>
      json(
        call(`/assets/${assetId}/tokenize`, {
          method: "POST",
          token: officerToken,
          body: { symbol },
        }),
      ),
    ledgerMe: (token) => json(call("/ledger/me", { token })),
    creditLedger: async (officerToken, investorId, amountRial) => {
      await call(`/ledger/${investorId}/credit`, {
        method: "POST",
        token: officerToken,
        body: { amountRial },
      });
    },
    listOfferings: (token) => json(call("/offerings", { token })),
    createOffering: (officerToken, body) =>
      json(call("/offerings", { method: "POST", token: officerToken, body })),
    openOffering: async (officerToken, offeringId) => {
      await call(`/offerings/${offeringId}/open`, { method: "POST", token: officerToken });
    },
    closeOffering: (officerToken, offeringId) =>
      json(call(`/offerings/${offeringId}/close`, { method: "POST", token: officerToken })),
    subscribeOffering: async (token, offeringId, tokens) => {
      await call(`/offerings/${offeringId}/subscribe`, {
        method: "POST",
        token,
        body: { tokens },
      });
    },
    listDistributions: (officerToken) => json(call("/distributions", { token: officerToken })),
    declareDistribution: (officerToken, assetId, totalAmountRial) =>
      json(
        call("/distributions", {
          method: "POST",
          token: officerToken,
          body: { assetId, totalAmountRial },
        }),
      ),
    assetOverview: (officerToken) => json(call("/reporting/assets", { token: officerToken })),
    systemHealth: (officerToken) => json(call("/reporting/health", { token: officerToken })),
    publishAttestation: (officerToken, body) =>
      json(call("/attestations", { method: "POST", token: officerToken, body })),
    listAttestations: (officerToken, assetId) =>
      json(call(`/attestations?assetId=${encodeURIComponent(assetId)}`, { token: officerToken })),
    payDistribution: async (officerToken, distributionId) => {
      await call(`/distributions/${distributionId}/pay`, { method: "POST", token: officerToken });
    },
    myHoldings: (token) => json(call("/transfers/holdings", { token })),
    transferTokens: (token, body) => json(call("/transfers", { method: "POST", token, body })),
    requestRedemption: (token, body) => json(call("/redemptions", { method: "POST", token, body })),
    myRedemptions: (token) => json(call("/redemptions/me", { token })),
    listRedemptions: (officerToken) => json(call("/redemptions", { token: officerToken })),
    fulfillRedemption: (officerToken, redemptionId) =>
      json(call(`/redemptions/${redemptionId}/fulfill`, { method: "POST", token: officerToken })),
    rejectRedemption: async (officerToken, redemptionId, reason) => {
      await call(`/redemptions/${redemptionId}/reject`, {
        method: "POST",
        token: officerToken,
        body: { reason },
      });
    },
    holderRegistry: (officerToken, assetId) =>
      json(call(`/reporting/assets/${assetId}/registry`, { token: officerToken })),
    registryCsv: (officerToken, assetId) =>
      csv(call(`/reporting/assets/${assetId}/registry.csv`, { token: officerToken })),
    transfersCsv: (officerToken, assetId) =>
      csv(call(`/reporting/assets/${assetId}/transfers.csv`, { token: officerToken })),
    auditTrail: (officerToken, filter = {}) => {
      const query = new URLSearchParams({
        ...(filter.assetId !== undefined ? { assetId: filter.assetId } : {}),
        ...(filter.limit !== undefined ? { limit: String(filter.limit) } : {}),
      }).toString();
      return json(call(`/reporting/audit${query ? `?${query}` : ""}`, { token: officerToken }));
    },
    listInvestors: (officerToken) => json(call("/investors", { token: officerToken })),
    investorDetail: (officerToken, investorId) =>
      json(call(`/investors/${investorId}/detail`, { token: officerToken })),
  };
};
