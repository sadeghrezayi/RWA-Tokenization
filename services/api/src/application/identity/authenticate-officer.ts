import { InvalidCredentialsError } from "./errors.js";
import type { PasswordHasher, TokenIssuer } from "./ports.js";

// Walking skeleton: one env-configured compliance officer. A staff-user table
// with per-officer identity arrives together with the FR-RA-2 audit log.
export interface OfficerCredentials {
  email: string;
  passwordHash: string;
}

export class AuthenticateOfficer {
  constructor(
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly officer: OfficerCredentials,
  ) {}

  async execute(input: { email: string; password: string }): Promise<{ token: string }> {
    const matchesEmail = input.email.trim().toLowerCase() === this.officer.email.toLowerCase();
    if (!matchesEmail || !(await this.hasher.verify(input.password, this.officer.passwordHash))) {
      throw new InvalidCredentialsError();
    }
    return { token: await this.tokens.issue({ kind: "officer", officerId: "officer-1" }) };
  }
}
