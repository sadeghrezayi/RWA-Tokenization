import type { EmailAddress } from "./email-address.js";
import type { PasswordHash } from "./password-hash.js";

export type StaffUserStatus = "active" | "disabled";

// A staff/operator account (1.4c). Roles are granted via Membership; the domain
// stays agnostic to the specific role catalog (validated in the application),
// so it holds role names as plain strings. Investors are a separate aggregate —
// staff are platform-level operators, not tenant-owned.
export class StaffUser {
  private constructor(
    public readonly id: string,
    public readonly email: EmailAddress,
    public readonly passwordHash: PasswordHash,
    public readonly status: StaffUserStatus,
    public readonly roles: readonly string[],
  ) {}

  static create(
    id: string,
    email: EmailAddress,
    passwordHash: PasswordHash,
    roles: readonly string[],
  ): StaffUser {
    return new StaffUser(id, email, passwordHash, "active", [...roles]);
  }

  static restore(
    id: string,
    email: EmailAddress,
    passwordHash: PasswordHash,
    status: StaffUserStatus,
    roles: readonly string[],
  ): StaffUser {
    return new StaffUser(id, email, passwordHash, status, [...roles]);
  }

  isActive(): boolean {
    return this.status === "active";
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }
}
