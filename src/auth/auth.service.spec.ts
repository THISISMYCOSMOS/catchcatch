import { createHmac } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { InternalApiGuard } from './internal-api.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { WithdrawAccountDto } from './dto/withdraw-account.dto';

const HMAC_SECRET = 'test-phone-hmac-secret-at-least-32-characters';
const TERMS_VERSION = 'pending-test-version';
const TERMS_SHA256 = 'a'.repeat(64);

describe('AuthService', () => {
  it('creates users only on the signup OTP path', async () => {
    const signInWithOtp = jest.fn().mockResolvedValue({ data: {}, error: null });
    const service = authServiceWithAuthClient({ signInWithOtp });

    await service.sendPhoneOtp({ phone: '+821012345678', purpose: 'login' });
    await service.sendPhoneOtp({ phone: '+821012345678', purpose: 'signup', captchaToken: 'captcha' });

    expect(signInWithOtp).toHaveBeenNthCalledWith(1, {
      phone: '+821012345678',
      options: { shouldCreateUser: false, captchaToken: undefined },
    });
    expect(signInWithOtp).toHaveBeenNthCalledWith(2, {
      phone: '+821012345678',
      options: { shouldCreateUser: true, captchaToken: 'captcha' },
    });
  });

  it('blocks signup OTP when the exact terms document is not configured', async () => {
    const service = authServiceWithAuthClient({}, {}, HMAC_SECRET, {
      TERMS_VERSION: '',
      TERMS_DOCUMENT_SHA256: '',
    });

    await expect(service.sendPhoneOtp({ phone: '+821012345678', purpose: 'signup' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('records terms after OTP verification and derives only an HMAC for access checks', async () => {
    const rpc = defaultRpc();
    const service = authServiceWithAuthClient({
      verifyOtp: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', phone: '+821012345678' },
          session: { access_token: 'access-token', refresh_token: 'refresh-token', expires_at: 123 },
        },
        error: null,
      }),
    }, { rpc });

    const result = await service.verifyPhoneOtp({
      phone: '+821012345678', token: '123456', acceptTerms: true,
    });

    expect(result.user).toEqual({ id: 'user-1', email: null, phone: '+821012345678' });
    expect(rpc).toHaveBeenCalledWith('record_terms_consent', expect.objectContaining({
      p_user_id: 'user-1',
      p_terms_version: TERMS_VERSION,
      p_document_sha256: TERMS_SHA256,
    }));
    expect(rpc).toHaveBeenCalledWith('ensure_phone_user_access', {
      p_user_id: 'user-1',
      p_phone_hmac: createHmac('sha256', HMAC_SECRET).update('+821012345678').digest('hex'),
      p_terms_version: TERMS_VERSION,
      p_document_sha256: TERMS_SHA256,
    });
    const accessCall = rpc.mock.calls.find((call) => call[0] === 'ensure_phone_user_access');
    expect(JSON.stringify(accessCall)).not.toContain('+821012345678');
  });

  it('derives the same quota identity for a new user id using the same phone', async () => {
    const rpc = defaultRpc();
    const verifyOtp = jest.fn()
      .mockResolvedValueOnce({
        data: {
          user: { id: 'deleted-user-id', phone: '+821012345678' },
          session: { access_token: 'a1', refresh_token: 'r1', expires_at: 1 },
        }, error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'new-user-id', phone: '+821012345678' },
          session: { access_token: 'a2', refresh_token: 'r2', expires_at: 2 },
        }, error: null,
      });
    const service = authServiceWithAuthClient({ verifyOtp }, { rpc });

    await service.verifyPhoneOtp({ phone: '+821012345678', token: '123456', acceptTerms: true });
    await service.verifyPhoneOtp({ phone: '+821012345678', token: '654321', acceptTerms: true });

    const accessCalls = rpc.mock.calls.filter((call) => call[0] === 'ensure_phone_user_access');
    expect(accessCalls).toHaveLength(2);
    expect(accessCalls[0]![1].p_phone_hmac).toBe(accessCalls[1]![1].p_phone_hmac);
    expect(accessCalls.map((call) => call[1].p_user_id))
      .toEqual(['deleted-user-id', 'new-user-id']);
  });

  it('rejects invalid OTPs and invalid HMAC configuration', async () => {
    const service = authServiceWithAuthClient({
      verifyOtp: jest.fn().mockResolvedValue({
        data: { user: null, session: null }, error: { message: 'invalid token' },
      }),
    });

    await expect(service.verifyPhoneOtp({
      phone: '+821012345678', token: '000000', acceptTerms: false,
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(() => authServiceWithAuthClient({}, {}, 'short'))
      .toThrow('PHONE_IDENTITY_HMAC_SECRET must be at least 32 characters');
  });

  it('checks phone identity and current terms again when refreshing', async () => {
    const rpc = defaultRpc();
    const refreshSession = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'user-1', phone: '+821012345678' },
        session: { access_token: 'new-access', refresh_token: 'new-refresh', expires_at: 456 },
      }, error: null,
    });
    const service = authServiceWithAuthClient({ refreshSession }, { rpc });

    await expect(service.refresh({ refreshToken: 'old-refresh' })).resolves.toMatchObject({
      accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 456,
    });
    expect(rpc).toHaveBeenCalledWith('ensure_phone_user_access', expect.any(Object));
  });

  it('sends withdrawal OTP only to the phone bound to the current session', async () => {
    const signInWithOtp = jest.fn().mockResolvedValue({ data: {}, error: null });
    const service = authServiceWithAuthClient({ signInWithOtp });

    await expect(service.sendWithdrawalOtp({
      id: 'user-1', email: null, phone: '+821012345678',
    })).resolves.toEqual({ sent: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+821012345678',
      options: { shouldCreateUser: false },
    });
  });

  it('withdraws through the atomic database RPC only after same-user phone verification', async () => {
    const rpc = defaultRpc();
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1', phone: '+821012345678' }, session: {} },
      error: null,
    });
    const service = authServiceWithAuthClient({ verifyOtp }, { rpc });

    await expect(service.withdraw({
      id: 'user-1', email: null, phone: '+821012345678',
    }, '123456')).resolves.toEqual({ success: true });
    expect(verifyOtp).toHaveBeenCalledWith({
      phone: '+821012345678', token: '123456', type: 'sms',
    });
    expect(rpc).toHaveBeenCalledWith('withdraw_user_account', expect.objectContaining({
      p_user_id: 'user-1',
    }));
  });

  it('does not withdraw when the OTP resolves to a different user', async () => {
    const rpc = defaultRpc();
    const service = authServiceWithAuthClient({
      verifyOtp: jest.fn().mockResolvedValue({
        data: { user: { id: 'other-user', phone: '+821012345678' }, session: {} },
        error: null,
      }),
    }, { rpc });

    await expect(service.withdraw({
      id: 'user-1', email: null, phone: '+821012345678',
    }, '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rpc).not.toHaveBeenCalledWith('withdraw_user_account', expect.anything());
  });

  it('logs out only the current session', async () => {
    const signOut = jest.fn().mockResolvedValue({ data: null, error: null });
    const service = authServiceWithAuthClient({}, { auth: { admin: { signOut } } });
    await expect(service.logout('access-token')).resolves.toEqual({ success: true });
    expect(signOut).toHaveBeenCalledWith('access-token', 'local');
  });

  it('validates E.164 phone, six-digit OTP, and explicit consent state', async () => {
    const send = new SendPhoneOtpDto();
    send.phone = '010-1234-5678';
    send.purpose = 'login';
    await expect(validate(send)).resolves.not.toHaveLength(0);

    const verify = new VerifyPhoneOtpDto();
    verify.phone = '+821012345678';
    verify.token = '12345';
    verify.acceptTerms = false;
    await expect(validate(verify)).resolves.not.toHaveLength(0);

    const withdrawal = new WithdrawAccountDto();
    withdrawal.token = '12345';
    await expect(validate(withdrawal)).resolves.not.toHaveLength(0);
  });
});

describe('Auth guards', () => {
  it('accepts access tokens from an HttpOnly cookie', async () => {
    const auth = {
      verifyAccessToken: jest.fn().mockResolvedValue({ id: 'user-1', email: null, phone: '+821012345678' }),
    };
    const guard = new AuthGuard(auth as never);
    const request = { headers: { cookie: 'catchcatch_access_token=cookie-access-token' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.verifyAccessToken).toHaveBeenCalledWith('cookie-access-token');
    expect(request).toMatchObject({ accessToken: 'cookie-access-token' });
  });

  it('uses session-only validation for logout and withdrawal', async () => {
    const auth = {
      verifySessionAccessToken: jest.fn().mockResolvedValue({ id: 'user-1', email: null, phone: '+821012345678' }),
    };
    const guard = new SessionAuthGuard(auth as never);
    await expect(guard.canActivate(contextFor({
      headers: { authorization: 'Bearer access-token' },
    }))).resolves.toBe(true);
    expect(auth.verifySessionAccessToken).toHaveBeenCalledWith('access-token');
  });

  it('rejects requests without bearer or cookie authentication', async () => {
    const guard = new AuthGuard({ verifyAccessToken: jest.fn() } as never);
    await expect(guard.canActivate(contextFor({ headers: {} })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('InternalApiGuard', () => {
  const previousToken = process.env.INTERNAL_API_TOKEN;
  afterEach(() => {
    if (previousToken === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previousToken;
  });

  it('accepts only matching internal tokens', () => {
    process.env.INTERNAL_API_TOKEN = 'internal-token';
    const guard = new InternalApiGuard();
    expect(guard.canActivate(contextFor({ headers: { 'x-internal-api-token': 'internal-token' } }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(UnauthorizedException);
  });
});

describe('AuthController HttpOnly cookie responses', () => {
  it('sets access and refresh cookies without returning either token in JSON', async () => {
    const controller = new AuthController({
      verifyPhoneOtp: jest.fn().mockResolvedValue({
        user: { id: 'user-1', email: null, phone: '+821012345678' },
        accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: 4_102_444_800,
      }),
    } as never);
    const response = mockResponse();

    const result = await controller.verifyPhoneOtp({
      phone: '+821012345678', token: '123456', acceptTerms: true,
    }, response);

    expect(result).toEqual({
      user: { id: 'user-1', email: null, phone: '+821012345678' }, expiresAt: 4_102_444_800,
    });
    expect(JSON.stringify(result)).not.toContain('access-token');
    expect(JSON.stringify(result)).not.toContain('refresh-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'catchcatch_access_token', 'access-token',
      expect.objectContaining({ httpOnly: true, secure: true, path: '/' }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'catchcatch_refresh_token', 'refresh-token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('uses only the refresh cookie, requests withdrawal OTP, and clears cookies after verified withdrawal', async () => {
    const refresh = jest.fn().mockResolvedValue({
      user: { id: 'user-1', email: null, phone: '+821012345678' },
      accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 456,
    });
    const logout = jest.fn().mockResolvedValue({ success: true });
    const sendWithdrawalOtp = jest.fn().mockResolvedValue({ sent: true });
    const withdraw = jest.fn().mockResolvedValue({ success: true });
    const controller = new AuthController({ refresh, logout, sendWithdrawalOtp, withdraw } as never);
    const response = mockResponse();
    const user = { id: 'user-1', email: null, phone: '+821012345678' };

    await controller.refresh({ headers: { cookie: 'catchcatch_refresh_token=old-refresh' } }, response);
    expect(refresh).toHaveBeenCalledWith({ refreshToken: 'old-refresh' });
    await controller.logout('access-token', response);
    await controller.sendWithdrawalOtp(user);
    await controller.withdraw({ token: '123456' }, user, response);

    expect(response.clearCookie).toHaveBeenCalledWith(
      'catchcatch_access_token', expect.objectContaining({ httpOnly: true, secure: true }),
    );
    expect(sendWithdrawalOtp).toHaveBeenCalledWith(user);
    expect(withdraw).toHaveBeenCalledWith(user, '123456');
  });
});

function defaultRpc() {
  return jest.fn((fn: string, _args: Record<string, unknown>) => Promise.resolve({
    data: fn === 'ensure_phone_user_access' || fn === 'withdraw_user_account' ? true : {},
    error: null,
  }));
}

function mockClient(overrides: Record<string, unknown> = {}) {
  const authOverride = (overrides.auth ?? {}) as Record<string, unknown>;
  return {
    rpc: jest.fn(),
    ...overrides,
    auth: {
      refreshSession: jest.fn(), getUser: jest.fn(), admin: { signOut: jest.fn() }, ...authOverride,
    },
  } as never;
}

function authServiceWithAuthClient(
  authOverrides: Record<string, unknown>,
  clientOverrides: Record<string, unknown> = {},
  secret = HMAC_SECRET,
  termsOverrides: Record<string, string> = {},
) {
  return new AuthService(
    mockClient(clientOverrides),
    new ConfigService({
      PHONE_IDENTITY_HMAC_SECRET: secret,
      TERMS_VERSION,
      TERMS_DOCUMENT_SHA256: TERMS_SHA256,
      ...termsOverrides,
    }),
    () => mockClient({ auth: authOverrides }),
  );
}

function contextFor(request: unknown) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

function mockResponse() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}
