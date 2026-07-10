export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

export interface InvestorViewDto {
  id: string;
  email: string;
  kycState: KycState;
  kycRejectionReason?: string;
  eligibleForClaims: boolean;
}

export interface ApiClient {
  register(email: string): Promise<{ investorId: string }>;
  getInvestor(investorId: string): Promise<InvestorViewDto>;
  submitKyc(investorId: string): Promise<void>;
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

const jsonHeaders = { "content-type": "application/json" };

const ensureOk = async (res: Response): Promise<Response> => {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return res;
};

export const createApiClient = (
  baseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
): ApiClient => ({
  async register(email) {
    const res = await ensureOk(
      await fetch(`${baseUrl}/investors`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email }),
      }),
    );
    return (await res.json()) as { investorId: string };
  },

  async getInvestor(investorId) {
    const res = await ensureOk(await fetch(`${baseUrl}/investors/${investorId}`));
    return (await res.json()) as InvestorViewDto;
  },

  async submitKyc(investorId) {
    await ensureOk(
      await fetch(`${baseUrl}/investors/${investorId}/kyc/submit`, { method: "POST" }),
    );
  },
});
