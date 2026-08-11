import { Catch, HttpException, Logger, Optional } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  AccountLockedError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidMfaChallengeError,
  InvalidMfaCodeError,
  InvalidResetTokenError,
  InvalidVerificationTokenError,
  InvestorNotFoundError,
  MfaAlreadyEnrolledError,
  MfaNotEnrolledError,
  TooManyRequestsError,
  WeakPasswordError,
} from "../../application/identity/errors.js";
import {
  InvalidEmailError,
  InvalidKycTransitionError,
  InvalidRejectionReasonError,
} from "../../domain/identity/errors.js";
import {
  AssetNotFoundError,
  EmptyDocumentError,
  InvalidTokenSymbolError,
  NoPositionInAssetError,
} from "../../application/assets/errors.js";
import {
  ChecklistIncompleteError,
  DocumentNotInDossierError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidAssetTransitionError,
  InvalidCustodyArrangementError,
  InvalidDossierDocumentError,
  InvalidRealEstateProfileError,
  InvalidRightError,
  UnknownRightError,
} from "../../domain/assets/errors.js";
import {
  AssetNotTokenizedError,
  InsufficientFundsError,
  InvestorNotEligibleError,
  OfferingNotFoundError,
} from "../../application/offerings/errors.js";
import {
  InvalidOfferingConfigError,
  InvalidOfferingTransitionError,
  SubscriptionLimitError,
  SubscriptionWindowClosedError,
} from "../../domain/offerings/errors.js";
import {
  AssetNotTokenizedForDistributionError,
  DistributionNotFoundError,
  NoHoldersError,
} from "../../application/distributions/errors.js";
import {
  InvalidDistributionError,
  InvalidDistributionTransitionError,
} from "../../domain/distributions/errors.js";
import { InvalidAttestationError } from "../../domain/attestations/errors.js";
import { InvalidTransferError } from "../../domain/transfers/errors.js";
import {
  AssetNotTokenizedForTransferError,
  InsufficientTokenBalanceError,
  TransferNotAllowedError,
} from "../../application/transfers/errors.js";
import {
  InvalidRedemptionError,
  InvalidRedemptionTransitionError,
} from "../../domain/redemptions/errors.js";
import {
  NoFreshValuationError,
  RedemptionNotFoundError,
} from "../../application/redemptions/errors.js";
import { AssetNotTokenizedForRegistryError } from "../../application/registry/errors.js";
import { FollowUpNotFoundError } from "../../application/crm/errors.js";
import {
  InvalidFollowUpError,
  InvalidFollowUpTransitionError,
  InvalidNoteError,
  InvalidStageError,
  InvalidTagError,
} from "../../domain/crm/errors.js";
import { CorruptWalletDirectoryError } from "../../domain/registry/wallet-address.js";
import {
  CorruptEventStreamError,
  InvalidRegistryEventError,
} from "../../domain/registry/errors.js";
import {
  InvalidApprovalTransitionError,
  SelfApprovalError,
} from "../../domain/approvals/errors.js";
import { ApprovalNotFoundError } from "../../application/approvals/errors.js";
import { NotificationNotFoundError } from "../../application/notifications/errors.js";
import { InvalidNotificationError } from "../../domain/notifications/errors.js";
import {
  InvalidFundingAmountError,
  InvalidFundingReferenceError,
  InvalidFundingTransitionError,
  MissingRejectionReasonError,
} from "../../domain/funding/errors.js";
import { FundingRequestNotFoundError } from "../../application/funding/errors.js";
import {
  EntityOnboardingNotAvailableError,
  InvalidOnboardingTransitionError,
  OnboardingIncompleteError,
} from "../../domain/onboarding/errors.js";
import {
  EvidenceNotFoundError,
  EvidenceTooLargeError,
  InvalidStepAnswersError,
  KycDecisionIsFinalError,
  MissingIdentityEvidenceError,
  OnboardingNotStartedError,
  UnsupportedEvidenceTypeError,
} from "../../application/onboarding/errors.js";

interface MinimalResponse {
  status(code: number): { json(body: unknown): void };
  setHeader(name: string, value: string): void;
}

// Just enough of a logger to be substitutable in a test.
interface ErrorLog {
  error(message: string, stack?: string): void;
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  // @Optional so Nest does not try to resolve a provider for it; the
  // default is what runs in the application, the substitute in tests.
  constructor(@Optional() private readonly log: ErrorLog = new Logger(DomainErrorFilter.name)) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<MinimalResponse>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // A 500 is an incident whichever type it arrives as. This branch used to
      // return silently, which is how a CI failure showed "internal server
      // error" with nothing in the log to explain it.
      if (status >= 500) {
        this.log.error(exception.message, exception.stack);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    // T4: throttled responses advertise how long to wait (RFC 7231 Retry-After).
    if (exception instanceof AccountLockedError || exception instanceof TooManyRequestsError) {
      response.setHeader("Retry-After", String(exception.retryAfterSeconds));
    }

    const status = statusFor(exception);
    if (status === 500) {
      // The client learns nothing (an unmapped failure may carry internals),
      // but an operator must be able to find out what actually broke — a 500
      // with no trace anywhere is undiagnosable.
      this.log.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    const message =
      status === 500
        ? "internal server error"
        : exception instanceof Error
          ? exception.message
          : "unknown error";
    response.status(status).json({ statusCode: status, message });
  }
}

const statusFor = (exception: unknown): number => {
  if (exception instanceof AccountLockedError) return 429;
  if (exception instanceof TooManyRequestsError) return 429;
  if (exception instanceof InvalidCredentialsError) return 401;
  // MFA challenge failures are authentication failures (bad/expired factor).
  if (exception instanceof InvalidMfaCodeError) return 401;
  if (exception instanceof InvalidMfaChallengeError) return 401;
  // Enrollment state conflicts (already on / nothing pending).
  if (exception instanceof MfaAlreadyEnrolledError) return 409;
  if (exception instanceof MfaNotEnrolledError) return 409;
  if (exception instanceof InvestorNotFoundError) return 404;
  if (exception instanceof AssetNotFoundError) return 404;
  // Not 404: the asset plainly exists, the holder simply has no claim on it.
  if (exception instanceof NoPositionInAssetError) return 403;
  if (exception instanceof EmailAlreadyRegisteredError) return 409;
  if (exception instanceof InvalidKycTransitionError) return 409;
  // Asset state-machine and approval-gate violations are conflicts with
  // current state (FR-AO-4/5).
  if (exception instanceof InvalidAssetTransitionError) return 409;
  if (exception instanceof DossierFrozenError) return 409;
  if (exception instanceof DocumentNotInDossierError) return 409;
  if (exception instanceof IncompleteDossierError) return 409;
  if (exception instanceof ChecklistIncompleteError) return 409;
  if (exception instanceof InvalidEmailError) return 400;
  if (exception instanceof InvalidRejectionReasonError) return 400;
  if (exception instanceof WeakPasswordError) return 400;
  if (exception instanceof InvalidResetTokenError) return 400;
  if (exception instanceof InvalidVerificationTokenError) return 400;
  if (exception instanceof InvalidDossierDocumentError) return 400;
  if (exception instanceof InvalidCustodyArrangementError) return 400;
  // 3.1: a malformed property, an unknown right, or a right asserted with no
  // wording are all bad input — the request, not the state, is wrong.
  if (exception instanceof InvalidRealEstateProfileError) return 400;
  if (exception instanceof UnknownRightError) return 400;
  if (exception instanceof InvalidRightError) return 400;
  if (exception instanceof EmptyDocumentError) return 400;
  if (exception instanceof InvalidTokenSymbolError) return 400;
  if (exception instanceof OfferingNotFoundError) return 404;
  if (exception instanceof InvestorNotEligibleError) return 403;
  if (exception instanceof AssetNotTokenizedError) return 409;
  if (exception instanceof InsufficientFundsError) return 409;
  if (exception instanceof InvalidOfferingTransitionError) return 409;
  if (exception instanceof SubscriptionWindowClosedError) return 409;
  if (exception instanceof InvalidOfferingConfigError) return 400;
  if (exception instanceof SubscriptionLimitError) return 400;
  if (exception instanceof DistributionNotFoundError) return 404;
  if (exception instanceof AssetNotTokenizedForDistributionError) return 409;
  if (exception instanceof NoHoldersError) return 409;
  if (exception instanceof InvalidDistributionTransitionError) return 409;
  if (exception instanceof InvalidDistributionError) return 400;
  if (exception instanceof InvalidAttestationError) return 400;
  if (exception instanceof InvalidTransferError) return 400;
  if (exception instanceof TransferNotAllowedError) return 403;
  if (exception instanceof InsufficientTokenBalanceError) return 409;
  if (exception instanceof AssetNotTokenizedForTransferError) return 409;
  if (exception instanceof InvalidRedemptionError) return 400;
  if (exception instanceof InvalidRedemptionTransitionError) return 409;
  if (exception instanceof RedemptionNotFoundError) return 404;
  if (exception instanceof NoFreshValuationError) return 409;
  // Registry integrity failures surface with their message (409, not a blank
  // 500) so the operator sees exactly why the export is refused (NFR-2).
  if (exception instanceof AssetNotTokenizedForRegistryError) return 409;
  if (exception instanceof CorruptEventStreamError) return 409;
  // Same posture for the wallet directory: an unusable custodial address is
  // named in a 409, never a blank 500 nobody can trace.
  if (exception instanceof CorruptWalletDirectoryError) return 409;
  if (exception instanceof InvalidRegistryEventError) return 409;
  if (exception instanceof InvalidStageError) return 400;
  if (exception instanceof InvalidTagError) return 400;
  if (exception instanceof InvalidNoteError) return 400;
  if (exception instanceof InvalidFollowUpError) return 400;
  if (exception instanceof InvalidFollowUpTransitionError) return 409;
  if (exception instanceof FollowUpNotFoundError) return 404;
  // Maker-checker (T1/T3): four-eyes / already-decided → 409; unknown → 404.
  if (exception instanceof SelfApprovalError) return 409;
  if (exception instanceof InvalidApprovalTransitionError) return 409;
  if (exception instanceof ApprovalNotFoundError) return 404;
  // Notifications (1.7): unknown / not-mine → 404; invalid construction → 400.
  if (exception instanceof NotificationNotFoundError) return 404;
  if (exception instanceof InvalidNotificationError) return 400;
  // 2.3: onboarding. State-machine conflicts are 409; a request the applicant
  // can fix by sending something else is 400; an oversized document gets the
  // status that names the actual problem (413).
  if (exception instanceof OnboardingNotStartedError) return 404;
  if (exception instanceof EvidenceNotFoundError) return 404;
  if (exception instanceof InvalidOnboardingTransitionError) return 409;
  if (exception instanceof OnboardingIncompleteError) return 409;
  if (exception instanceof MissingIdentityEvidenceError) return 409;
  if (exception instanceof KycDecisionIsFinalError) return 409;
  if (exception instanceof UnsupportedEvidenceTypeError) return 400;
  if (exception instanceof InvalidStepAnswersError) return 400;
  if (exception instanceof EntityOnboardingNotAvailableError) return 400;
  if (exception instanceof EvidenceTooLargeError) return 413;
  // 2.4 funding: a settled request refusing a second settlement is a conflict
  // with current state, not bad input.
  if (exception instanceof FundingRequestNotFoundError) return 404;
  if (exception instanceof InvalidFundingTransitionError) return 409;
  if (exception instanceof InvalidFundingAmountError) return 400;
  if (exception instanceof InvalidFundingReferenceError) return 400;
  if (exception instanceof MissingRejectionReasonError) return 400;
  return 500;
};
