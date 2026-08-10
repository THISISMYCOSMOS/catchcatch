import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { loadInternalApiToken } from '../config/env';

type HeaderRequest = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HeaderRequest>();
    const provided = firstHeader(request.headers['x-internal-api-token']);
    if (!provided) {
      throw new UnauthorizedException('x-internal-api-token is required');
    }
    const expected = readExpectedToken();
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid internal API token');
    }
    return true;
  }
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function readExpectedToken(): string {
  try {
    return loadInternalApiToken();
  } catch {
    throw new InternalServerErrorException('Internal API token is not configured');
  }
}
