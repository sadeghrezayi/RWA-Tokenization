import { LoginThrottle } from "../../domain/identity/login-throttle.js";
import type { LoginThrottleConfig } from "../../domain/identity/login-throttle.js";
import type { Clock } from "../offerings/ports.js";
import { AccountLockedError, InvalidCredentialsError } from "./errors.js";
import type { LoginAttemptStore } from "./ports.js";

// T4 account lockout: wraps a login attempt. Blocks up front if the account is
// currently locked; on an invalid-credentials outcome it records a failure
// (which may trip the lock); on success it clears the failure history. Other
// errors (e.g. infrastructure) do not count as failed attempts.
export class LoginThrottleService {
  constructor(
    private readonly store: LoginAttemptStore,
    private readonly clock: Clock,
    private readonly config: LoginThrottleConfig,
  ) {}

  async guard<T>(identifier: string, attempt: () => Promise<T>): Promise<T> {
    const key = identifier.trim().toLowerCase();
    const now = this.clock.now();
    const throttle = await this.store.load(key);
    if (throttle.isLocked(now)) {
      throw new AccountLockedError(throttle.retryAfterSeconds(now));
    }
    try {
      const result = await attempt();
      if (throttle.failures > 0) {
        await this.store.save(key, throttle.recordSuccess());
      }
      return result;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        await this.store.save(key, throttle.recordFailure(now, this.config));
      }
      throw error;
    }
  }
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleConfig = {
  maxFailures: 5,
  windowSeconds: 900,
  lockoutSeconds: 900,
};

export { LoginThrottle };
