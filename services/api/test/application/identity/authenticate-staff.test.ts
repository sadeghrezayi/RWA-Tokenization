import { describe, expect, it } from "vitest";
import { AuthenticateStaff } from "../../../src/application/identity/authenticate-staff.js";
import { InvalidCredentialsError } from "../../../src/application/identity/errors.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { StaffUser } from "../../../src/domain/identity/staff-user.js";
import {
  FakeMfaChallengeIssuer,
  FakePasswordHasher,
  InMemoryMfaStore,
  InMemoryStaffUserRepository,
  RecordingTokenIssuer,
} from "../../fakes/identity-fakes.js";

const setup = async (roles: readonly string[] = ["super_admin"]) => {
  const users = new InMemoryStaffUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new RecordingTokenIssuer();
  const mfaStore = new InMemoryMfaStore();
  await users.save(
    StaffUser.create(
      "officer-1",
      EmailAddress.of("officer@platform.local"),
      PasswordHash.of(await hasher.hash("0fficer-pass")),
      roles,
    ),
  );
  return {
    users,
    tokens,
    mfaStore,
    auth: new AuthenticateStaff(users, hasher, tokens, mfaStore, new FakeMfaChallengeIssuer()),
  };
};

describe("AuthenticateStaff", () => {
  it("issues_a_token_carrying_the_users_roles", async () => {
    const s = await setup(["treasury"]);

    const result = await s.auth.execute({
      email: "Officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result).toEqual({ status: "authenticated", token: "token:officer:officer-1" });
    expect(s.tokens.issued).toEqual([
      { kind: "officer", officerId: "officer-1", roles: ["treasury"] },
    ]);
  });

  it.each([
    { email: "officer@platform.local", password: "wrong" },
    { email: "nobody@platform.local", password: "0fficer-pass" },
    { email: "not-an-email", password: "0fficer-pass" },
  ])("rejects_bad_staff_credentials_%#", async (attempt) => {
    const s = await setup();
    await expect(s.auth.execute(attempt)).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects_a_disabled_account", async () => {
    const s = await setup();
    await s.users.save(
      StaffUser.restore(
        "officer-1",
        EmailAddress.of("officer@platform.local"),
        PasswordHash.of(await new FakePasswordHasher().hash("0fficer-pass")),
        "disabled",
        ["super_admin"],
      ),
    );
    await expect(
      s.auth.execute({ email: "officer@platform.local", password: "0fficer-pass" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("requires_mfa_when_the_user_has_an_active_enrollment", async () => {
    const s = await setup();
    await s.mfaStore.save("officer-1", { secret: "S", status: "active", recoveryCodeHashes: [] });

    const result = await s.auth.execute({
      email: "officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result).toEqual({ status: "mfa_required", challengeToken: "challenge:officer-1" });
  });

  it("does_not_require_mfa_while_enrollment_is_only_pending", async () => {
    const s = await setup();
    await s.mfaStore.save("officer-1", { secret: "S", status: "pending", recoveryCodeHashes: [] });

    const result = await s.auth.execute({
      email: "officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result.status).toBe("authenticated");
  });
});
