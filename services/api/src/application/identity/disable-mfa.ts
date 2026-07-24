import type { MfaStore } from "./ports.js";

// T1/T4 MFA — turn it off. Idempotent: deleting a non-existent enrollment is a
// no-op. (Whether disabling should itself require a fresh code is a hardening
// choice for when MFA becomes mandatory; opt-in pilot keeps it simple.)
export class DisableMfa {
  constructor(private readonly store: MfaStore) {}

  async execute(input: { principalId: string }): Promise<void> {
    await this.store.delete(input.principalId);
  }
}
