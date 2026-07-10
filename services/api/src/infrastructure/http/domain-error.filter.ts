import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  EmailAlreadyRegisteredError,
  InvestorNotFoundError,
} from "../../application/identity/errors.js";
import {
  InvalidEmailError,
  InvalidKycTransitionError,
  InvalidRejectionReasonError,
} from "../../domain/identity/errors.js";

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
  if (exception instanceof InvestorNotFoundError) return 404;
  if (exception instanceof EmailAlreadyRegisteredError) return 409;
  if (exception instanceof InvalidKycTransitionError) return 409;
  if (exception instanceof InvalidEmailError) return 400;
  if (exception instanceof InvalidRejectionReasonError) return 400;
  return 500;
};
