import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiGuard } from './internal-api.guard';

describe('InternalApiGuard', () => {
  it('accepts the configured internal token', () => {
    const guard = new InternalApiGuard(configWithToken('shared-secret'));
    expect(guard.canActivate(contextWithToken('shared-secret'))).toBe(true);
  });

  it('rejects a missing or incorrect token', () => {
    const guard = new InternalApiGuard(configWithToken('shared-secret'));
    expect(() => guard.canActivate(contextWithToken(undefined))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextWithToken('wrong-secret'))).toThrow(UnauthorizedException);
  });

  it('fails closed when the server token is not configured', () => {
    const guard = new InternalApiGuard(configWithToken(undefined));
    expect(() => guard.canActivate(contextWithToken('any-token'))).toThrow(
      ServiceUnavailableException,
    );
  });
});

function configWithToken(value: string | undefined): ConfigService {
  return {
    get: jest.fn().mockReturnValue(value),
  } as unknown as ConfigService;
}

function contextWithToken(value: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: value ? { 'x-internal-api-token': value } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}
