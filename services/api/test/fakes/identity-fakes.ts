import type { EmailAddress } from "../../src/domain/identity/email-address.js";
import type { Investor } from "../../src/domain/identity/investor.js";
import type {
  ClaimIssuer,
  IdGenerator,
  InvestorRepository,
} from "../../src/application/identity/ports.js";

export class InMemoryInvestorRepository implements InvestorRepository {
  private readonly byId = new Map<string, Investor>();

  findById(id: string): Promise<Investor | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByEmail(email: EmailAddress): Promise<Investor | undefined> {
    return Promise.resolve([...this.byId.values()].find((i) => i.email.equals(email)));
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
