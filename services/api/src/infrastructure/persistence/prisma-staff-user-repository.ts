import type { PrismaClient } from "@prisma/client";
import { EmailAddress } from "../../domain/identity/email-address.js";
import { PasswordHash } from "../../domain/identity/password-hash.js";
import { StaffUser } from "../../domain/identity/staff-user.js";
import type { StaffUserStatus } from "../../domain/identity/staff-user.js";
import type { StaffUserRepository } from "../../application/identity/ports.js";

interface StaffUserRow {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  memberships: { role: string }[];
}

// Platform-level (pre-auth) staff store — takes the RAW Prisma client;
// staff_users/staff_memberships are in UNSCOPED_MODELS.
export class PrismaStaffUserRepository implements StaffUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: EmailAddress): Promise<StaffUser | undefined> {
    const row = await this.prisma.staffUser.findUnique({
      where: { email: email.value },
      include: { memberships: true },
    });
    return row ? toDomain(row) : undefined;
  }

  async findById(id: string): Promise<StaffUser | undefined> {
    const row = await this.prisma.staffUser.findUnique({
      where: { id },
      include: { memberships: true },
    });
    return row ? toDomain(row) : undefined;
  }

  async save(user: StaffUser): Promise<void> {
    const data = {
      email: user.email.value,
      passwordHash: user.passwordHash.value,
      status: user.status,
    };
    await this.prisma.staffUser.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
    // Memberships are a set — replace them wholesale.
    await this.prisma.staffMembership.deleteMany({ where: { userId: user.id } });
    if (user.roles.length > 0) {
      await this.prisma.staffMembership.createMany({
        data: user.roles.map((role) => ({ userId: user.id, role })),
      });
    }
  }
}

const toDomain = (row: StaffUserRow): StaffUser =>
  StaffUser.restore(
    row.id,
    EmailAddress.of(row.email),
    PasswordHash.of(row.passwordHash),
    row.status as StaffUserStatus,
    row.memberships.map((m) => m.role),
  );
