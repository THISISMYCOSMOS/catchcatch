import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { CurrentAccessToken } from './current-access-token.decorator';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { WithdrawAccountDto } from './dto/withdraw-account.dto';
import { ACCESS_COOKIE_NAME, AuthGuard } from './auth.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('phone/send-otp')
  sendPhoneOtp(@Body() body: SendPhoneOtpDto) {
    return this.service.sendPhoneOtp(body);
  }

  @Post('phone/verify-otp')
  async verifyPhoneOtp(
    @Body() body: VerifyPhoneOtpDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.verifyPhoneOtp(body);
    setAuthCookies(response, result);
    return toPublicAuthResponse(result);
  }

  @Post('refresh')
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = getRefreshTokenFromCookie(request);
    const result = await this.service.refresh({ refreshToken });
    setAuthCookies(response, result);
    return toPublicAuthResponse(result);
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  async logout(
    @CurrentAccessToken() accessToken: string,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.logout(accessToken);
    clearAuthCookies(response);
    return result;
  }

  @UseGuards(SessionAuthGuard)
  @Post('account/reauth/send-otp')
  sendWithdrawalOtp(@CurrentUser() user: AuthenticatedUser) {
    return this.service.sendWithdrawalOtp(user);
  }

  @UseGuards(SessionAuthGuard)
  @Delete('account')
  async withdraw(
    @Body() body: WithdrawAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.service.withdraw(user, body.token);
    clearAuthCookies(response);
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
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
};

function toPublicAuthResponse(result: {
  user: unknown;
  expiresAt: number | null;
}) {
  return {
    user: result.user,
    expiresAt: result.expiresAt,
  };
}

function setAuthCookies(
  response: CookieResponse,
  result: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
  },
): void {
  if (result.accessToken) {
    response.cookie(ACCESS_COOKIE_NAME, result.accessToken, {
      ...ACCESS_COOKIE_OPTIONS,
      ...(result.expiresAt
        ? { maxAge: Math.max(result.expiresAt * 1000 - Date.now(), 0) }
        : {}),
    });
  }
  if (result.refreshToken) {
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
  }
}

function clearAuthCookies(response: CookieResponse): void {
  response.clearCookie(ACCESS_COOKIE_NAME, ACCESS_COOKIE_OPTIONS);
  response.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_OPTIONS.path,
    httpOnly: true,
    secure: true,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
  });
}

function getRefreshTokenFromCookie(request: CookieRequest): string | undefined {
  const rawCookie = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;
  if (!rawCookie) {
    return undefined;
  }
  const cookies = rawCookie.split(';').map((cookie) => cookie.trim());
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const cookie = cookies.find((candidate) => candidate.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}
