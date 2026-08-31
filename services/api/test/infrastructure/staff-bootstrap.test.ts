import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { StaffBootstrap } from "../../src/infrastructure/auth/staff-bootstrap.js";
import { EmailAddress } from "../../src/domain/identity/email-address.js";
import { StaffUser } from "../../src/domain/identity/staff-user.js";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../../src/application/identity/authorization.js";
import type { PasswordHasher, StaffUserRepository } from "../../src/application/identity/ports.js";

class InMemoryStaffUsers implements StaffUserRepository {
  readonly saved = new Map<string, StaffUser>();

  findByEmail(email: EmailAddress): Promise<StaffUser | undefined> {
    return Promise.resolve(
      [...this.saved.values()].find((user) => user.email.value === email.value),
    );
  }
  findById(id: string): Promise<StaffUser | undefined> {
    return Promise.resolve(this.saved.get(id));
  }
  findAll(): Promise<StaffUser[]> {
    return Promise.resolve([...this.saved.values()]);
  }
  save(user: StaffUser): Promise<void> {
    // Keyed by id, so a second boot REPLACES rather than duplicates — the
    // property the "idempotent on every boot" claim rests on.
    this.saved.set(user.id, user);
    return Promise.resolve();
  }
}

const hasher: PasswordHasher = {
  hash: (plain: string) => Promise.resolve(`hashed:${plain}`.padEnd(60, "x")),
  verify: () => Promise.resolve(true),
};

describe("StaffBootstrap", () => {
  let users: InMemoryStaffUsers;
  const env = { ...process.env };

  beforeEach(() => {
    users = new InMemoryStaffUsers();
    delete process.env.OFFICER_EMAIL;
    delete process.env.OFFICER_PASSWORD_HASH;
    delete process.env.OFFICER2_EMAIL;
    delete process.env.OFFICER2_PASSWORD_HASH;
    delete process.env.OFFICER3_EMAIL;
    delete process.env.OFFICER3_PASSWORD_HASH;
    delete process.env.OFFICER4_EMAIL;
    delete process.env.OFFICER4_PASSWORD_HASH;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  const boot = async () => {
    await new StaffBootstrap(users, hasher).onModuleInit();
    return users;
  };

  it("seeds an AUDITOR, so the read-only role has someone who can log in", async () => {
    // 4.4 / FR-RA-4: the auditor role has real capabilities now (registry
    // reconciliation, distribution reconciliation), but a role nobody can sign
    // in as is a capability nobody has. Same root cause as K-35.
    await boot();

    const auditor = await users.findByEmail(EmailAddress.of("auditor@platform.local"));
    expect(auditor).toBeDefined();
    expect(auditor?.roles).toEqual(["auditor"]);
  });

  it("gives the auditor READ permissions and no power to change anything", async () => {
    // The whole point of the role. If this ever grants a write permission,
    // "read-only auditor" in the PRD stops being true.
    await boot();

    const granted = ROLE_PERMISSIONS.auditor;
    for (const forbidden of [
      PERMISSIONS.LEDGER_CREDIT,
      PERMISSIONS.DISTRIBUTION_MANAGE,
      PERMISSIONS.ASSET_MANAGE,
      PERMISSIONS.APPROVAL_DECIDE,
      PERMISSIONS.ATTESTATION_PUBLISH,
      PERMISSIONS.KYC_REVIEW,
    ]) {
      expect(granted.has(forbidden)).toBe(false);
    }
    expect(granted.has(PERMISSIONS.REPORTING_READ)).toBe(true);
    expect(granted.has(PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it("still seeds the super-admin and treasury accounts", async () => {
    await boot();

    expect((await users.findByEmail(EmailAddress.of("officer@platform.local")))?.roles).toEqual([
      "super_admin",
    ]);
    expect((await users.findByEmail(EmailAddress.of("treasury@platform.local")))?.roles).toEqual([
      "treasury",
    ]);
  });

  it("seeds an APPROVER, so a super-admin's four-eyes request can be decided (K-35)", async () => {
    // K-35: `approval.decide` is held only by super_admin and approver, and
    // self-approval is correctly refused — so with no approver account, a
    // request made BY the super_admin could never be decided by anyone. Since
    // 4.1 every payout goes through four eyes, so this stranded every payout
    // the super-admin requested.
    await boot();

    const approver = await users.findByEmail(EmailAddress.of("approver@platform.local"));
    expect(approver).toBeDefined();
    expect(approver?.roles).toEqual(["approver"]);
  });

  it("gives the approver the power to DECIDE but never to make the request", () => {
    // A checker who can also originate is not a second pair of eyes.
    const granted = ROLE_PERMISSIONS.approver;
    expect(granted.has(PERMISSIONS.APPROVAL_DECIDE)).toBe(true);
    for (const maker of [
      PERMISSIONS.LEDGER_CREDIT,
      PERMISSIONS.DISTRIBUTION_MANAGE,
      PERMISSIONS.REDEMPTION_MANAGE,
    ]) {
      expect(granted.has(maker)).toBe(false);
    }
  });

  it("is idempotent — a second boot replaces rather than duplicates", async () => {
    await boot();
    await new StaffBootstrap(users, hasher).onModuleInit();

    expect(users.saved.size).toBe(4);
  });

  it("honours a configured auditor email and password hash", async () => {
    // Production must never depend on the dev default password.
    process.env.OFFICER3_EMAIL = "external.auditor@example.com";
    process.env.OFFICER3_PASSWORD_HASH = "argon2-hash-from-config".padEnd(60, "x");

    await boot();

    const auditor = await users.findByEmail(EmailAddress.of("external.auditor@example.com"));
    expect(auditor).toBeDefined();
    expect(auditor?.passwordHash.value).toBe("argon2-hash-from-config".padEnd(60, "x"));
  });
});

// The bootstrap warns when no password hash is configured, because a platform
// running on a built-in default super-admin password is a serious condition and
// the warning is how anyone finds out. It used to print the password itself.
//
// That is a credential in the application log — which is read by developers,
// shipped to aggregators and pasted into CI summaries — and the condition it
// fires under is exactly the one where the credential still WORKS. The value
// adds nothing: it is a constant in this repository, and the warning is just as
// actionable without it.
describe("StaffBootstrap — what its warning writes down", () => {
  const captureWarnings = async (run: () => Promise<void>): Promise<string> => {
    const lines: string[] = [];
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation((message: unknown) => {
      lines.push(String(message));
    });
    try {
      await run();
    } finally {
      warn.mockRestore();
    }
    return lines.join("\n");
  };

  it("warns that a development password is in use WITHOUT printing it", async () => {
    const users = new InMemoryStaffUsers();
    const output = await captureWarnings(() => new StaffBootstrap(users, hasher).onModuleInit());

    expect(output).not.toContain("officer-dev-pass");
    // Still says the dangerous thing, and names the fix.
    expect(output.toLowerCase()).toContain("development");
    expect(output).toContain("OFFICER_PASSWORD_HASH");
  });
});
