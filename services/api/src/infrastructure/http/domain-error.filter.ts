import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvestorNotFoundError,
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

interface MinimalResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<MinimalResponse>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
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
  if (exception instanceof InvalidCredentialsError) return 401;
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
  return 500;
};
