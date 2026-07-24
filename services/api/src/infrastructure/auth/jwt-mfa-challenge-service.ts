import { SignJWT, jwtVerify } from "jose";
import type { MfaChallengeIssuer } from "../../application/identity/ports.js";

// Short-lived (5 min) purpose-scoped token bridging the two officer-login steps
// (T4). It carries a `purpose` claim and NO `principal`, so:
//  - a session token (has `principal`, no purpose) is rejected here, and
//  - this challenge token is rejected by the session verifier (no principal),
// even though both are signed with the same auth secret. One key, two shapes.
const ISSUER = "tokenization-api";
const PURPOSE = "officer-mfa-challenge";
const TTL = "5m";

export class JwtMfaChallengeService implements MfaChallengeIssuer {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(principalId: string): Promise<string> {
    return new SignJWT({ purpose: PURPOSE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setSubject(principalId)
      .setIssuedAt()
      .setExpirationTime(TTL)
      .sign(this.key);
  }

  async verify(token: string): Promise<string | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER });
      if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") {
        return undefined;
      }
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
