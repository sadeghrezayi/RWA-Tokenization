import { Catch, HttpException } from "@nestjs/common";
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
} from "../../application/assets/errors.js";
import {
  ChecklistIncompleteError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidAssetTransitionError,
  InvalidCustodyArrangementError,
  InvalidDossierDocumentError,
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
import {
  CorruptEventStreamError,
  InvalidRegistryEventError,
} from "../../domain/registry/errors.js";

interface MinimalResponse {
  status(code: number): { json(body: unknown): void };
  setHeader(name: string, value: string): void;
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<MinimalResponse>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    // T4: throttled responses advertise how long to wait (RFC 7231 Retry-After).
    if (exception instanceof AccountLockedError || exception instanceof TooManyRequestsError) {
      response.setHeader("Retry-After", String(exception.retryAfterSeconds));
    }

    const status = statusFor(exception);
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
  if (exception instanceof EmailAlreadyRegisteredError) return 409;
  if (exception instanceof InvalidKycTransitionError) return 409;
  // Asset state-machine and approval-gate violations are conflicts with
  // current state (FR-AO-4/5).
  if (exception instanceof InvalidAssetTransitionError) return 409;
  if (exception instanceof DossierFrozenError) return 409;
  if (exception instanceof IncompleteDossierError) return 409;
  if (exception instanceof ChecklistIncompleteError) return 409;
  if (exception instanceof InvalidEmailError) return 400;
  if (exception instanceof InvalidRejectionReasonError) return 400;
  if (exception instanceof WeakPasswordError) return 400;
  if (exception instanceof InvalidResetTokenError) return 400;
  if (exception instanceof InvalidVerificationTokenError) return 400;
  if (exception instanceof InvalidDossierDocumentError) return 400;
  if (exception instanceof InvalidCustodyArrangementError) return 400;
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
  if (exception instanceof InvalidRegistryEventError) return 409;
  if (exception instanceof InvalidStageError) return 400;
  if (exception instanceof InvalidTagError) return 400;
  if (exception instanceof InvalidNoteError) return 400;
  if (exception instanceof InvalidFollowUpError) return 400;
  if (exception instanceof InvalidFollowUpTransitionError) return 409;
  if (exception instanceof FollowUpNotFoundError) return 404;
  return 500;
};
