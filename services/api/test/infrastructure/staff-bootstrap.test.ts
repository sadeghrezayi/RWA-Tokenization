import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("is idempotent — a second boot replaces rather than duplicates", async () => {
    await boot();
    await new StaffBootstrap(users, hasher).onModuleInit();

    expect(users.saved.size).toBe(3);
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
