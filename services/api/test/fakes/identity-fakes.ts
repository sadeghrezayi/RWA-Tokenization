import type { EmailAddress } from "../../src/domain/identity/email-address.js";
import type { Investor } from "../../src/domain/identity/investor.js";
import type { KycState } from "../../src/domain/identity/kyc-status.js";
import type {
  ClaimIssuer,
  IdGenerator,
  InvestorRepository,
  MfaChallengeIssuer,
  MfaEnrollment,
  MfaStore,
  PasswordHasher,
  Principal,
  TokenIssuer,
} from "../../src/application/identity/ports.js";

export class InMemoryInvestorRepository implements InvestorRepository {
  private readonly byId = new Map<string, Investor>();

  findById(id: string): Promise<Investor | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByEmail(email: EmailAddress): Promise<Investor | undefined> {
    return Promise.resolve([...this.byId.values()].find((i) => i.email.equals(email)));
  }

  findByKycStates(states: readonly KycState[]): Promise<Investor[]> {
    return Promise.resolve(
      [...this.byId.values()].filter((i) => states.includes(i.kycStatus.state)),
    );
  }

  findAll(): Promise<Investor[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  save(investor: Investor): Promise<void> {
    this.byId.set(investor.id, investor);
    return Promise.resolve();
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  nextId(): string {
    this.counter += 1;
    return `inv-${String(this.counter)}`;
  }
}

export class RecordingClaimIssuer implements ClaimIssuer {
  readonly issuedFor: string[] = [];
  failWith: Error | undefined;

  issueKycApprovedClaim(investorId: string): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.issuedFor.push(investorId);
    return Promise.resolve();
  }
}

// Deterministic, reversible stand-in for argon2 in unit tests.
export class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}

export class RecordingTokenIssuer implements TokenIssuer {
  readonly issued: Principal[] = [];

  issue(principal: Principal): Promise<string> {
    this.issued.push(principal);
    const id = principal.kind === "investor" ? principal.investorId : principal.officerId;
    return Promise.resolve(`token:${principal.kind}:${id}`);
  }
}

export class InMemoryMfaStore implements MfaStore {
  readonly map = new Map<string, MfaEnrollment>();

  load(principalId: string): Promise<MfaEnrollment | undefined> {
    const e = this.map.get(principalId);
    return Promise.resolve(e ? { ...e, recoveryCodeHashes: [...e.recoveryCodeHashes] } : undefined);
  }

  save(principalId: string, enrollment: MfaEnrollment): Promise<void> {
    this.map.set(principalId, {
      ...enrollment,
      recoveryCodeHashes: [...enrollment.recoveryCodeHashes],
    });
    return Promise.resolve();
  }

  delete(principalId: string): Promise<void> {
    this.map.delete(principalId);
    return Promise.resolve();
  }
}

// Deterministic stand-in for the signed short-lived challenge JWT. A token is
// simply `challenge:<principalId>`; anything else fails to verify.
export class FakeMfaChallengeIssuer implements MfaChallengeIssuer {
  issue(principalId: string): Promise<string> {
    return Promise.resolve(`challenge:${principalId}`);
  }

  verify(token: string): Promise<string | undefined> {
    return Promise.resolve(
      token.startsWith("challenge:") ? token.slice("challenge:".length) : undefined,
    );
  }
}
