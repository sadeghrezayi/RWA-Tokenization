import { PersonNotVerifiedError } from "./errors.js";
import type { PersonVerification } from "./ports.js";

// The user's rule, stated once (2026-08-15): the company's verification does
// not cover the people acting for it. Every path that attaches a person to an
// issuer goes through here, so the gate cannot be enforced on one path and
// forgotten on another.
// `describedAs` is how the CALLER identified the person — the address an
// inviter typed. The refusal has to be readable by whoever caused it, and a
// UUID names nobody. Defaults to the id for callers who have nothing better.
export const requireVerifiedPerson = async (
  verification: PersonVerification,
  userId: string,
  describedAs: string = userId,
): Promise<void> => {
  if (!(await verification.isVerified(userId))) {
    throw new PersonNotVerifiedError(describedAs);
  }
};
