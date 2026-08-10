import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { InternalApiGuard } from './internal-api.guard';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

describe('AuthService', () => {
  it('signs up with Supabase Auth and does not return passwords or secrets', async () => {
    const service = authServiceWithAuthClient({
      signUp: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'user@example.com' },
          session: null,
        },
        error: null,
      }),
    });

    const result = await service.signup({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(result).toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
    expect(JSON.stringify(result)).not.toContain('password123');
    expect(JSON.stringify(result)).not.toContain('service-role-key');
  });

  it('logs in and returns frontend-safe top-level session tokens', async () => {
    const service = authServiceWithAuthClient({
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'user@example.com' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_at: 123,
          },
        },
        error: null,
      }),
    });

    const result = await service.login({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(result).toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123,
    });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('password123');
    expect(JSON.stringify(result)).not.toContain('service-role-key');
  });

  it('refreshes a session and returns fresh top-level tokens', async () => {
    const refreshSession = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'user@example.com' },
        session: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_at: 456,
        },
      },
      error: null,
    });
    const service = authServiceWithAuthClient({ refreshSession });

    const result = await service.refresh({ refreshToken: 'old-refresh-token' });

    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: 'old-refresh-token' });
    expect(result).toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: 456,
    });
    expect(JSON.stringify(result)).not.toContain('service-role-key');
  });

  it('returns 401 for invalid refresh tokens', async () => {
    const service = authServiceWithAuthClient({
      refreshSession: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'bad refresh token' },
      }),
    });

    await expect(service.refresh({ refreshToken: 'bad-refresh-token' }))
      .rejects
      .toBeInstanceOf(UnauthorizedException);
  });

  it('logs out only the current session with the access token', async () => {
    const signOut = jest.fn().mockResolvedValue({ data: null, error: null });
    const service = new AuthService(mockClient({
      admin: { signOut },
    }));

    await expect(service.logout('access-token')).resolves.toEqual({ success: true });
    expect(signOut).toHaveBeenCalledWith('access-token', 'local');
  });

  it('returns 401 when logout token is invalid', async () => {
    const service = new AuthService(mockClient({
      admin: {
        signOut: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'invalid token' },
        }),
      },
    }));

    await expect(service.logout('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 when login succeeds without a session', async () => {
    const service = authServiceWithAuthClient({
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'user@example.com' },
          session: null,
        },
        error: null,
      }),
    });

    await expect(service.login({
      email: 'user@example.com',
      password: 'password123',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 for failed login and invalid access tokens', async () => {
    const service = new AuthService(mockClient({
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'bad token' },
      }),
    }), () => mockClient({
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
    }));

    await expect(service.login({
      email: 'user@example.com',
      password: 'wrong-password',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verifyAccessToken('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 500 when signup succeeds without a user', async () => {
    const service = authServiceWithAuthClient({
      signUp: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      }),
    });

    await expect(service.signup({
      email: 'user@example.com',
      password: 'password123',
    })).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('validates signup and login DTOs', async () => {
    const signup = new SignupDto();
    signup.email = 'not-an-email';
    signup.password = 'short';
    await expect(validate(signup)).resolves.not.toHaveLength(0);

    const login = new LoginDto();
    login.email = 'not-an-email';
    login.password = '';
    await expect(validate(login)).resolves.not.toHaveLength(0);
  });
});

describe('AuthGuard', () => {
  it('accepts valid bearer tokens and stores the current user on the request', async () => {
    const auth = {
      verifyAccessToken: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' }),
    };
    const guard = new AuthGuard(auth as never);
    const request = { headers: { authorization: 'Bearer access-token' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(auth.verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(request).toMatchObject({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'access-token',
    });
  });

  it('rejects missing and malformed authorization headers', async () => {
    const auth = { verifyAccessToken: jest.fn() };
    const guard = new AuthGuard(auth as never);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(contextFor({ headers: { authorization: 'Basic token' } })))
      .rejects
      .toBeInstanceOf(UnauthorizedException);
  });
});

describe('InternalApiGuard', () => {
  const previousToken = process.env.INTERNAL_API_TOKEN;

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
    } else {
      process.env.INTERNAL_API_TOKEN = previousToken;
    }
  });

  it('accepts only matching x-internal-api-token values', () => {
    process.env.INTERNAL_API_TOKEN = 'internal-token';
    const guard = new InternalApiGuard();

    expect(guard.canActivate(contextFor({
      headers: { 'x-internal-api-token': 'internal-token' },
    }))).toBe(true);
    expect(() => guard.canActivate(contextFor({
      headers: {},
    }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextFor({
      headers: { 'x-internal-api-token': 'wrong-token' },
    }))).toThrow(UnauthorizedException);
  });
});

describe('AuthController cookie responses', () => {
  it('sets refresh cookie and omits refreshToken from login JSON', async () => {
    const controller = new AuthController({
      login: jest.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: 123,
      }),
    } as never);
    const response = mockResponse();

    const result = await controller.login({
      email: 'user@example.com',
      password: 'password123',
    }, response);

    expect(result).toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'access-token',
      expiresAt: 123,
    });
    expect(JSON.stringify(result)).not.toContain('refresh-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'catchcatch_refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('refreshes from cookie and omits refreshToken from refresh JSON', async () => {
    const refresh = jest.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: 456,
    });
    const controller = new AuthController({ refresh } as never);
    const response = mockResponse();

    const result = await controller.refresh({}, {
      headers: { cookie: 'catchcatch_refresh_token=old-refresh-token' },
    }, response);

    expect(refresh).toHaveBeenCalledWith({ refreshToken: 'old-refresh-token' });
    expect(result).toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'new-access-token',
      expiresAt: 456,
    });
    expect(JSON.stringify(result)).not.toContain('new-refresh-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'catchcatch_refresh_token',
      'new-refresh-token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('clears refresh cookie on logout', async () => {
    const controller = new AuthController({
      logout: jest.fn().mockResolvedValue({ success: true }),
    } as never);
    const response = mockResponse();

    await expect(controller.logout('access-token', response)).resolves.toEqual({ success: true });
    expect(response.clearCookie).toHaveBeenCalledWith(
      'catchcatch_refresh_token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });
});

function mockClient(authOverrides: Record<string, unknown>) {
  return {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      refreshSession: jest.fn(),
      getUser: jest.fn(),
      admin: {
        signOut: jest.fn(),
      },
      ...authOverrides,
    },
  } as never;
}

function authServiceWithAuthClient(authOverrides: Record<string, unknown>) {
  return new AuthService(mockClient({}), () => mockClient(authOverrides));
}

function contextFor(request: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

function mockResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}
