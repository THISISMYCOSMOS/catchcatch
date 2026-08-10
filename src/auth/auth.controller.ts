import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { CurrentAccessToken } from './current-access-token.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('signup')
  async signup(
    @Body() body: SignupDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.signup(body);
    setRefreshCookie(response, result.refreshToken);
    return toPublicAuthResponse(result);
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.login(body);
    setRefreshCookie(response, result.refreshToken);
    return toPublicAuthResponse(result);
  }

  @Post('refresh')
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = getRefreshTokenFromCookie(request) ?? body.refreshToken;
    const result = await this.service.refresh({ refreshToken });
    setRefreshCookie(response, result.refreshToken);
    return toPublicAuthResponse(result);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  async logout(
    @CurrentAccessToken() accessToken: string,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.logout(accessToken);
    clearRefreshCookie(response);
    return result;
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

type CookieRequest = {
  headers: Record<string, string | string[] | undefined>;
};

type CookieResponse = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
};

const REFRESH_COOKIE_NAME = 'catchcatch_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
};

function toPublicAuthResponse(result: {
  user: unknown;
  accessToken: string | null;
  expiresAt: number | null;
}) {
  return {
    user: result.user,
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
  };
}

function setRefreshCookie(
  response: CookieResponse,
  refreshToken: string | null,
): void {
  if (!refreshToken) {
    return;
  }
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(response: CookieResponse): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_OPTIONS.path,
    httpOnly: true,
    secure: true,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
  });
}

function getRefreshTokenFromCookie(request: CookieRequest): string | null {
  const rawCookie = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;
  if (!rawCookie) {
    return null;
  }
  const cookies = rawCookie.split(';').map((cookie) => cookie.trim());
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const cookie = cookies.find((candidate) => candidate.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}
