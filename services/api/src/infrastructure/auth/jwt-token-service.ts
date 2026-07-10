import { SignJWT, jwtVerify } from "jose";
import type { Principal, TokenIssuer } from "../../application/identity/ports.js";

export interface TokenVerifier {
  verify(token: string): Promise<Principal | undefined>;
}

const ISSUER = "tokenization-api";
const TOKEN_TTL = "1h";

export class JwtTokenService implements TokenIssuer, TokenVerifier {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(principal: Principal): Promise<string> {
    return new SignJWT({ principal })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(this.key);
  }

  async verify(token: string): Promise<Principal | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER });
      return isPrincipal(payload.principal) ? payload.principal : undefined;
    } catch {
      return undefined;
    }
  }
}

const isPrincipal = (value: unknown): value is Principal => {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    (p.kind === "investor" && typeof p.investorId === "string") ||
    (p.kind === "officer" && typeof p.officerId === "string")
  );
};
