export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

export interface InvestorViewDto {
  id: string;
  email: string;
  kycState: KycState;
  kycRejectionReason?: string;
  eligibleForClaims: boolean;
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
  };
};
