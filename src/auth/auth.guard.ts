import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  accessToken?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractAccessToken(request.headers);
    request.user = await this.auth.verifyAccessToken(token);
    request.accessToken = token;
    return true;
  }
}

export const ACCESS_COOKIE_NAME = 'catchcatch_access_token';

export function extractAccessToken(
  headers: Record<string, string | string[] | undefined>,
): string {
  const rawAuthorization = headers.authorization;
  const value = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  if (value) {
    const [scheme, token] = value.split(' ');
    if (scheme === 'Bearer' && token) return token;
  }

  const rawCookie = Array.isArray(headers.cookie) ? headers.cookie[0] : headers.cookie;
  if (rawCookie) {
    const prefix = `${ACCESS_COOKIE_NAME}=`;
    const cookie = rawCookie.split(';')
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.startsWith(prefix));
    if (cookie) return decodeURIComponent(cookie.slice(prefix.length));
  }

  throw new UnauthorizedException('Authentication token is required');
}
