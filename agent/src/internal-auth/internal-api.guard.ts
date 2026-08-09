import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

type HeaderRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.config.get<string>('INTERNAL_API_TOKEN');
    if (!expectedToken) {
      throw new ServiceUnavailableException({
        code: 'INTERNAL_API_TOKEN_MISSING',
      });
    }

    const request = context.switchToHttp().getRequest<HeaderRequest>();
    const rawToken = request.headers?.['x-internal-api-token'];
    const suppliedToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    if (!suppliedToken || !tokensMatch(expectedToken, suppliedToken)) {
      throw new UnauthorizedException({ code: 'INVALID_INTERNAL_API_TOKEN' });
    }
    return true;
  }
}

function tokensMatch(expected: string, supplied: string): boolean {
  const expectedDigest = createHash('sha256').update(expected).digest();
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
