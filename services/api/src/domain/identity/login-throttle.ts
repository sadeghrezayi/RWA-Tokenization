// T4 mitigation (account lockout): counts failed logins inside a rolling
// window and locks the account for a cooldown once the threshold is reached.
// Pure value object — the clock is always injected by the caller.
export interface LoginThrottleConfig {
  maxFailures: number;
  windowSeconds: number;
  lockoutSeconds: number;
}

export interface LoginThrottleState {
  failures: number;
  windowStartedAt: Date | undefined;
  lockedUntil: Date | undefined;
}

export class LoginThrottle {
  private constructor(
    public readonly failures: number,
    public readonly windowStartedAt: Date | undefined,
    public readonly lockedUntil: Date | undefined,
  ) {}

  static empty(): LoginThrottle {
    return new LoginThrottle(0, undefined, undefined);
  }

  static restore(state: LoginThrottleState): LoginThrottle {
    return new LoginThrottle(state.failures, state.windowStartedAt, state.lockedUntil);
  }

  isLocked(now: Date): boolean {
    return this.lockedUntil !== undefined && this.lockedUntil.getTime() > now.getTime();
  }

  retryAfterSeconds(now: Date): number {
    const lockedUntil = this.lockedUntil;
    if (lockedUntil === undefined || lockedUntil.getTime() <= now.getTime()) {
      return 0;
    }
    return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
  }

  recordFailure(now: Date, config: LoginThrottleConfig): LoginThrottle {
    if (this.isLocked(now)) {
      // Already locked — the caller blocks before attempting, so this is a
      // belt-and-braces no-op that never extends the existing lock.
      return this;
    }
    const windowExpired =
      this.windowStartedAt === undefined ||
      now.getTime() - this.windowStartedAt.getTime() > config.windowSeconds * 1000;
    if (windowExpired) {
      return new LoginThrottle(1, now, undefined);
    }
    const failures = this.failures + 1;
    const lockedUntil =
      failures >= config.maxFailures
        ? new Date(now.getTime() + config.lockoutSeconds * 1000)
        : undefined;
    return new LoginThrottle(failures, this.windowStartedAt, lockedUntil);
  }

  recordSuccess(): LoginThrottle {
    return LoginThrottle.empty();
  }
}
