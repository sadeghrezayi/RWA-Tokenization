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
const SECOND_STAFF_ID = "officer-2";
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
  }

  private async seedSuperAdmin(): Promise<void> {
    const email = process.env.OFFICER_EMAIL ?? "officer@platform.local";
    const configuredHash = process.env.OFFICER_PASSWORD_HASH;
    if (!configuredHash) {
      this.log.warn(
        `OFFICER_PASSWORD_HASH is not set — dev super-admin password is "${DEV_STAFF_PASSWORD}"`,
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
}
