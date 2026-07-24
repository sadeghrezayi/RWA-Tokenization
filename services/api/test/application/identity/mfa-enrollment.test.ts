import { describe, expect, it } from "vitest";
import { StartMfaEnrollment } from "../../../src/application/identity/start-mfa-enrollment.js";
import { ConfirmMfaEnrollment } from "../../../src/application/identity/confirm-mfa-enrollment.js";
import { DisableMfa } from "../../../src/application/identity/disable-mfa.js";
import { GetMfaStatus } from "../../../src/application/identity/get-mfa-status.js";
import {
  InvalidMfaCodeError,
  MfaAlreadyEnrolledError,
  MfaNotEnrolledError,
} from "../../../src/application/identity/errors.js";
import { hashToken } from "../../../src/application/identity/token-hash.js";
import type {
  MfaEnrollment,
  MfaStore,
  RecoveryCodeGenerator,
  TotpService,
} from "../../../src/application/identity/ports.js";

const PRINCIPAL = "officer-1";
const GOOD_CODE = "123456";

class FakeTotpService implements TotpService {
  generateSecret(): string {
    return "SECRET-XYZ";
  }
  keyUri(secret: string, accountName: string): string {
    return `otpauth://totp/ATP:${accountName}?secret=${secret}`;
  }
  verify(secret: string, code: string): Promise<boolean> {
    return Promise.resolve(secret === "SECRET-XYZ" && code === GOOD_CODE);
  }
}

class InMemoryMfaStore implements MfaStore {
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

class FakeRecoveryCodeGenerator implements RecoveryCodeGenerator {
  generate(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `recovery-${String(i + 1)}`);
  }
}

const setup = () => {
  const store = new InMemoryMfaStore();
  const totp = new FakeTotpService();
  return {
    store,
    totp,
    start: new StartMfaEnrollment(store, totp),
    confirm: new ConfirmMfaEnrollment(store, totp, new FakeRecoveryCodeGenerator()),
    disable: new DisableMfa(store),
    status: new GetMfaStatus(store),
  };
};

describe("StartMfaEnrollment", () => {
  it("creates_a_pending_enrollment_and_returns_the_secret_and_uri", async () => {
    const s = setup();
    const result = await s.start.execute({ principalId: PRINCIPAL, accountName: "officer@x.com" });

    expect(result.secret).toBe("SECRET-XYZ");
    expect(result.keyUri).toContain("otpauth://totp/");
    const stored = await s.store.load(PRINCIPAL);
    expect(stored?.status).toBe("pending");
    expect(stored?.secret).toBe("SECRET-XYZ");
  });

  it("refuses_to_restart_when_mfa_is_already_active", async () => {
    const s = setup();
    await s.store.save(PRINCIPAL, {
      secret: "OLD",
      status: "active",
      recoveryCodeHashes: [],
    });
    await expect(
      s.start.execute({ principalId: PRINCIPAL, accountName: "officer@x.com" }),
    ).rejects.toThrow(MfaAlreadyEnrolledError);
  });
});

describe("ConfirmMfaEnrollment", () => {
  const startPending = async (s: ReturnType<typeof setup>) => {
    await s.start.execute({ principalId: PRINCIPAL, accountName: "officer@x.com" });
  };

  it("activates_mfa_and_returns_single_use_recovery_codes", async () => {
    const s = setup();
    await startPending(s);

    const { recoveryCodes } = await s.confirm.execute({ principalId: PRINCIPAL, code: GOOD_CODE });

    expect(recoveryCodes).toHaveLength(10);
    const stored = await s.store.load(PRINCIPAL);
    expect(stored?.status).toBe("active");
    // Only digests are persisted — never the plaintext codes.
    expect(stored?.recoveryCodeHashes).toEqual(recoveryCodes.map(hashToken));
    expect(stored?.recoveryCodeHashes).not.toContain(recoveryCodes[0]);
  });

  it("rejects_a_wrong_code_and_stays_pending", async () => {
    const s = setup();
    await startPending(s);
    await expect(s.confirm.execute({ principalId: PRINCIPAL, code: "000000" })).rejects.toThrow(
      InvalidMfaCodeError,
    );
    expect((await s.store.load(PRINCIPAL))?.status).toBe("pending");
  });

  it("rejects_confirmation_when_nothing_is_pending", async () => {
    const s = setup();
    await expect(s.confirm.execute({ principalId: PRINCIPAL, code: GOOD_CODE })).rejects.toThrow(
      MfaNotEnrolledError,
    );
  });
});

describe("GetMfaStatus / DisableMfa", () => {
  it("reports_none_pending_and_active", async () => {
    const s = setup();
    expect((await s.status.execute({ principalId: PRINCIPAL })).status).toBe("none");
    await s.start.execute({ principalId: PRINCIPAL, accountName: "officer@x.com" });
    expect((await s.status.execute({ principalId: PRINCIPAL })).status).toBe("pending");
    await s.confirm.execute({ principalId: PRINCIPAL, code: GOOD_CODE });
    expect((await s.status.execute({ principalId: PRINCIPAL })).status).toBe("active");
  });

  it("disables_mfa_back_to_none", async () => {
    const s = setup();
    await s.start.execute({ principalId: PRINCIPAL, accountName: "officer@x.com" });
    await s.confirm.execute({ principalId: PRINCIPAL, code: GOOD_CODE });
    await s.disable.execute({ principalId: PRINCIPAL });
    expect((await s.status.execute({ principalId: PRINCIPAL })).status).toBe("none");
  });
});
