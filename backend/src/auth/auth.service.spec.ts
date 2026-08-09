import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

describe('AuthService', () => {
  it('signs up with Supabase Auth and does not return passwords or secrets', async () => {
    const service = new AuthService(mockClient({
      signUp: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'user@example.com' },
          session: null,
        },
        error: null,
      }),
    }));

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
    const service = new AuthService(mockClient({
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
    }));

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

  it('returns 401 when login succeeds without a session', async () => {
    const service = new AuthService(mockClient({
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'user@example.com' },
          session: null,
        },
        error: null,
      }),
    }));

    await expect(service.login({
      email: 'user@example.com',
      password: 'password123',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 for failed login and invalid access tokens', async () => {
    const service = new AuthService(mockClient({
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'bad token' },
      }),
    }));

    await expect(service.login({
      email: 'user@example.com',
      password: 'wrong-password',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verifyAccessToken('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 500 when signup succeeds without a user', async () => {
    const service = new AuthService(mockClient({
      signUp: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      }),
    }));

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

function mockClient(authOverrides: Record<string, unknown>) {
  return {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      getUser: jest.fn(),
      ...authOverrides,
    },
  } as never;
}

function contextFor(request: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}
