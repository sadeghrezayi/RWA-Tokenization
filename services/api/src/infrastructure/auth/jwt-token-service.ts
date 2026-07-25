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

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

const isPrincipal = (value: unknown): value is Principal => {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.kind === "investor") {
    return typeof p.investorId === "string";
  }
  if (p.kind === "officer") {
    // roles is optional (legacy tokens omit it); if present it must be string[].
    return typeof p.officerId === "string" && (p.roles === undefined || isStringArray(p.roles));
  }
  return false;
};
