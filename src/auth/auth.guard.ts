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
    const token = extractBearerToken(request.headers.authorization);
    request.user = await this.auth.verifyAccessToken(token);
    request.accessToken = token;
    return true;
  }
}

function extractBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new UnauthorizedException('Authorization Bearer token is required');
  }
  const [scheme, token] = value.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedException('Authorization Bearer token is required');
  }
  return token;
}
