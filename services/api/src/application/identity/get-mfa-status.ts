import type { MfaStatus, MfaStore } from "./ports.js";

// T1/T4 MFA — the current enrollment state for a principal. "none" means no
// enrollment row exists; otherwise the stored status (pending | active).
export class GetMfaStatus {
  constructor(private readonly store: MfaStore) {}

  async execute(input: { principalId: string }): Promise<{ status: "none" | MfaStatus }> {
    const enrollment = await this.store.load(input.principalId);
    return { status: enrollment?.status ?? "none" };
  }
}
