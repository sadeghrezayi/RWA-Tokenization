import { Logger } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { EmailAddress } from "../../domain/identity/email-address.js";
import { PasswordHash } from "../../domain/identity/password-hash.js";
import { StaffUser } from "../../domain/identity/staff-user.js";
import { OFFICER_PRINCIPAL_ID } from "../../application/identity/authenticate-officer.js";
import type { PasswordHasher, StaffUserRepository } from "../../application/identity/ports.js";

// 1.4c: seeds the operator accounts on startup. The single env officer maps to a
// stable super-admin (behaviour-preserving login); a second treasury user gives
// maker-checker two real logins. Idempotent (upsert) — safe on every boot.
//
// 4.4: a third account gives the AUDITOR role someone who can log in. The role
// and its read-only permission set already existed, and FR-RA-4 gave it real
// capabilities (registry and distribution reconciliation) — but a role nobody
// can sign in as is a capability nobody has. That is K-35's root cause, and
// this closes it for the auditor without building a staff-management surface,
// which is a larger decision than "give this role a login".
const SECOND_STAFF_ID = "officer-2";
const THIRD_STAFF_ID = "officer-3";
const FOURTH_STAFF_ID = "officer-4";
const DEV_STAFF_PASSWORD = "officer-dev-pass";

export class StaffBootstrap implements OnModuleInit {
  private readonly log = new Logger(StaffBootstrap.name);

  constructor(
    private readonly users: StaffUserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedSuperAdmin();
    await this.seedTreasury();
    await this.seedAuditor();
    await this.seedApprover();
  }

  private async seedSuperAdmin(): Promise<void> {
    const email = process.env.OFFICER_EMAIL ?? "officer@platform.local";
    const configuredHash = process.env.OFFICER_PASSWORD_HASH;
    if (!configuredHash) {
      // The VALUE is deliberately not printed. It is a constant in this
      // repository, so echoing it discloses nothing new — but this warning
      // fires precisely when that password still WORKS, and the application
      // log is read by developers, shipped to aggregators and pasted into CI
      // summaries. The warning is just as actionable naming the variable.
      this.log.warn(
        "OFFICER_PASSWORD_HASH is not set — the super-admin is using the built-in " +
          "development password. Set OFFICER_PASSWORD_HASH before deploying.",
      );
    }
    const passwordHash = configuredHash ?? (await this.hasher.hash(DEV_STAFF_PASSWORD));
    await this.users.save(
      StaffUser.create(
        OFFICER_PRINCIPAL_ID,
        EmailAddress.of(email),
        PasswordHash.of(passwordHash),
        ["super_admin"],
      ),
    );
  }

  private async seedTreasury(): Promise<void> {
    const email = process.env.OFFICER2_EMAIL ?? "treasury@platform.local";
    const passwordHash =
      process.env.OFFICER2_PASSWORD_HASH ?? (await this.hasher.hash(DEV_STAFF_PASSWORD));
    await this.users.save(
      StaffUser.create(SECOND_STAFF_ID, EmailAddress.of(email), PasswordHash.of(passwordHash), [
        "treasury",
      ]),
    );
  }

  // 4.4 / FR-RA-4. Read-only by construction: the `auditor` role grants
  // INVESTOR_READ, REGISTRY_READ, AUDIT_READ and REPORTING_READ and nothing
  // that changes state — asserted directly in staff-bootstrap.test.ts, so a
  // future edit that hands this role a write permission fails there.
  private async seedAuditor(): Promise<void> {
    const email = process.env.OFFICER3_EMAIL ?? "auditor@platform.local";
    const configuredHash = process.env.OFFICER3_PASSWORD_HASH;
    if (!configuredHash) {
      this.log.warn(
        "OFFICER3_PASSWORD_HASH is not set — the auditor is using the built-in " +
          "development password. Set OFFICER3_PASSWORD_HASH before deploying.",
      );
    }
    const passwordHash = configuredHash ?? (await this.hasher.hash(DEV_STAFF_PASSWORD));
    await this.users.save(
      StaffUser.create(THIRD_STAFF_ID, EmailAddress.of(email), PasswordHash.of(passwordHash), [
        "auditor",
      ]),
    );
  }

  // K-35: `approval.decide` is held only by super_admin and approver, and
  // self-approval is refused — correctly. With no approver account, a four-eyes
  // request made BY the super-admin could never be decided by anyone, which
  // since 4.1 stranded every payout they requested. This gives the checker role
  // a real login, the same way the auditor got one.
  //
  // Deliberately the LEAST committal of K-35's three options: it neither grants
  // `approval.decide` to a role that should not have it, nor builds a
  // staff-management surface, which is a larger decision than this one.
  private async seedApprover(): Promise<void> {
    const email = process.env.OFFICER4_EMAIL ?? "approver@platform.local";
    const configuredHash = process.env.OFFICER4_PASSWORD_HASH;
    if (!configuredHash) {
      this.log.warn(
        "OFFICER4_PASSWORD_HASH is not set — the approver is using the built-in " +
          "development password. Set OFFICER4_PASSWORD_HASH before deploying.",
      );
    }
    const passwordHash = configuredHash ?? (await this.hasher.hash(DEV_STAFF_PASSWORD));
    await this.users.save(
      StaffUser.create(FOURTH_STAFF_ID, EmailAddress.of(email), PasswordHash.of(passwordHash), [
        "approver",
      ]),
    );
  }
}
