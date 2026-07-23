import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Principal } from "../../application/identity/ports.js";
import type { TokenVerifier } from "../auth/jwt-token-service.js";
import { parseCookies } from "./cookies.js";
import { SESSION_COOKIE } from "./session.js";

export const TOKEN_VERIFIER = "TOKEN_VERIFIER";

const IS_PUBLIC = "auth:isPublic";
const REQUIRED_ROLE = "auth:requiredRole";

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequireRole = (role: Principal["kind"]) => SetMetadata(REQUIRED_ROLE, role);

export type AuthVia = "cookie" | "bearer";

export interface AuthableRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
  // How the principal authenticated — the CSRF guard only challenges cookie
  // auth (bearer requests can't be forged cross-site).
  authVia?: AuthVia;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<AuthableRequest>();
    if (!request.principal) {
      throw new UnauthorizedException();
    }
    return request.principal;
  },
);

// Global guard: everything requires a bearer token unless marked @Public();
// @RequireRole() additionally pins the principal kind (403 on mismatch).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly tokens: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthableRequest>();
    // Browsers authenticate with the httpOnly session cookie; service/API
    // clients may still use a bearer token. Cookie wins when both are present.
    const cookieHeader = request.headers.cookie;
    const cookieToken = parseCookies(typeof cookieHeader === "string" ? cookieHeader : undefined)[
      SESSION_COOKIE
    ];
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;
    const via: AuthVia | undefined =
      cookieToken !== undefined ? "cookie" : bearerToken !== undefined ? "bearer" : undefined;
    const token = cookieToken ?? bearerToken;
    const principal = token === undefined ? undefined : await this.tokens.verify(token);
    if (!principal || via === undefined) {
      throw new UnauthorizedException("missing or invalid session");
    }
    request.principal = principal;
    request.authVia = via;

    const role = this.reflector.getAllAndOverride<Principal["kind"] | undefined>(
      REQUIRED_ROLE,
      targets,
    );
    if (role !== undefined && principal.kind !== role) {
      throw new ForbiddenException(`requires ${role} role`);
    }
    return true;
  }
}
