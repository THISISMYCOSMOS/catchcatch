import { createHmac } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, InternalServerErrorException, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { CatchCatchSupabaseClient, createSupabaseAuthClient, SUPABASE_CLIENT } from '../database/supabase.client';
import { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

export type AuthUserResponse = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type AuthResponse = {
  user: AuthUserResponse;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

export type PublicAuthResponse = Pick<AuthResponse, 'user' | 'expiresAt'>;

@Injectable()
export class AuthService {
  private readonly phoneHmacSecret: string;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
    private readonly config: ConfigService,
    @Optional()
    private readonly authClientFactory: () => CatchCatchSupabaseClient = createAuthClient,
  ) {
    const secret = this.config.get<string>('PHONE_IDENTITY_HMAC_SECRET')?.trim();
    if (!secret || secret.length < 32) {
      throw new Error('PHONE_IDENTITY_HMAC_SECRET must be at least 32 characters');
    }
    this.phoneHmacSecret = secret;
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const accountId = normalizeAccountId(input.accountId);
    const { data: account, error: accountError } = await this.client
      .from('user_accounts')
      .select('user_id')
      .eq('account_id', accountId)
      .maybeSingle();
    if (accountError || !account) {
      throw new UnauthorizedException('Invalid account ID or password');
    }

    const { data: adminData, error: adminError } = await this.client.auth.admin.getUserById(account.user_id);
    const phone = adminData.user?.phone?.trim();
    if (adminError || !adminData.user || !phone) {
      throw new UnauthorizedException('Invalid account ID or password');
    }

    const { data, error } = await this.createAuthClient().auth.signInWithPassword({
      phone,
      password: input.password,
    });
    if (error || !data.user || !data.session) {
      if (error?.status === 429) {
        throw new HttpException('Failed to login', 429);
      }
      throw new UnauthorizedException('Invalid account ID or password');
    }
    await this.assertPhoneUserAccess(data.user);
    return toAuthResponse(data.user, data.session, true);
  }

  async sendPhoneOtp(input: SendPhoneOtpDto): Promise<{ sent: true }> {
    this.currentTerms();
    const { error } = await this.createAuthClient().auth.signInWithOtp({
      phone: input.phone,
      options: {
        shouldCreateUser: true,
        captchaToken: input.captchaToken,
      },
    });
    if (error) {
      throw toAuthException(error, 'Failed to send phone verification code');
    }
    return { sent: true };
  }

  async verifyPhoneOtp(input: VerifyPhoneOtpDto): Promise<AuthResponse> {
    const terms = this.currentTerms();
    const accountId = normalizeAccountId(input.accountId);

    const authClient = this.createAuthClient();
    const { data, error } = await authClient.auth.verifyOtp({
      phone: input.phone,
      token: input.token,
      type: 'sms',
    });
    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Invalid or expired phone verification code');
    }
    await this.assertAccountIdAvailable(accountId);

    const { data: updated, error: updateError } = await authClient.auth.updateUser({
      password: input.password,
      data: { account_id: accountId },
    });
    if (updateError || !updated.user) {
      if (updateError) {
        throw toAuthException(updateError, 'Failed to create account credentials');
      }
      throw new InternalServerErrorException('Failed to create account credentials');
    }

    const { data: registered, error: registerError } = await this.client.rpc('register_user_account', {
      p_user_id: data.user.id,
      p_account_id: accountId,
      p_terms_version: terms.version,
      p_document_sha256: terms.documentSha256,
      p_accepted_at: new Date().toISOString(),
    });
    if (registerError || registered !== true) {
      if (registerError?.code === '23505') {
        throw new ConflictException('Account ID is already in use');
      }
      throw new InternalServerErrorException('Failed to register user account');
    }
    await this.assertPhoneUserAccess(updated.user);
    return toAuthResponse(updated.user, data.session, true);
  }

  async refresh(input: RefreshTokenDto): Promise<AuthResponse> {
    if (!input.refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const { data, error } = await this.createAuthClient().auth.refreshSession({
      refresh_token: input.refreshToken,
    });
    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    await this.assertPhoneUserAccess(data.user);
    return toAuthResponse(data.user, data.session, true);
  }

  async logout(accessToken: string): Promise<{ success: true }> {
    const { error } = await this.client.auth.admin.signOut(accessToken, 'local');
    if (error) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return { success: true };
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const user = await this.getAuthUser(accessToken);
    await this.assertPhoneUserAccess(user);
    return toAuthenticatedUser(user);
  }

  async verifySessionAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    return toAuthenticatedUser(await this.getAuthUser(accessToken));
  }

  private async getAuthUser(accessToken: string): Promise<User> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return data.user;
  }

  async sendWithdrawalOtp(user: AuthenticatedUser): Promise<{ sent: true }> {
    const phone = requireVerifiedPhone(user);
    const { error } = await this.createAuthClient().auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    if (error) {
      throw toAuthException(error, 'Failed to send withdrawal verification code');
    }
    return { sent: true };
  }

  async withdraw(user: AuthenticatedUser, token: string): Promise<{ success: true }> {
    const phone = requireVerifiedPhone(user);
    const { data: verification, error: verifyError } = await this.createAuthClient().auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (verifyError || !verification.user || verification.user.id !== user.id) {
      throw new UnauthorizedException('Invalid or expired withdrawal verification code');
    }

    const { data: withdrawn, error } = await this.client.rpc('withdraw_user_account', {
      p_user_id: user.id,
      p_now: new Date().toISOString(),
    });
    if (error || withdrawn !== true) {
      throw new InternalServerErrorException('Failed to withdraw user account');
    }
    return { success: true };
  }

  private async assertPhoneUserAccess(user: User): Promise<void> {
    const phone = user.phone?.trim();
    if (!phone) {
      throw new ForbiddenException('Verified phone is required');
    }
    const terms = this.currentTerms();
    const phoneHmac = createHmac('sha256', this.phoneHmacSecret).update(phone).digest('hex');
    const { data, error } = await (this.client as CatchCatchSupabaseClient & {
      rpc: (
        fn: 'ensure_phone_user_access',
        args: {
          p_user_id: string;
          p_phone_hmac: string;
          p_terms_version: string;
          p_document_sha256: string;
        },
      ) => Promise<{ data: boolean | null; error: AuthError | null }>;
    }).rpc('ensure_phone_user_access', {
      p_user_id: user.id,
      p_phone_hmac: phoneHmac,
      p_terms_version: terms.version,
      p_document_sha256: terms.documentSha256,
    });
    if (error) {
      throw new InternalServerErrorException('Failed to validate authenticated user access');
    }
    if (data !== true) {
      throw new ForbiddenException('Current terms consent is required');
    }
  }

  private async assertAccountIdAvailable(accountId: string): Promise<void> {
    const accountResult = await this.client
      .from('user_accounts')
      .select('user_id')
      .eq('account_id', accountId)
      .maybeSingle();
    if (accountResult.error) {
      throw new InternalServerErrorException('Failed to validate account ID');
    }
    if (accountResult.data) {
      throw new ConflictException('Account ID is already in use');
    }
  }

  private currentTerms(): { version: string; documentSha256: string } {
    const version = this.config.get<string>('TERMS_VERSION')?.trim();
    const documentSha256 = this.config.get<string>('TERMS_DOCUMENT_SHA256')?.trim();
    if (!version || !documentSha256 || !/^[0-9a-f]{64}$/.test(documentSha256)) {
      throw new ServiceUnavailableException('Current terms document is not configured');
    }
    return { version, documentSha256 };
  }

  private createAuthClient(): CatchCatchSupabaseClient {
    return (this.authClientFactory ?? createAuthClient)();
  }
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? metadataString(user, 'contact_email'),
    phone: user.phone ?? null,
  };
}

function requireVerifiedPhone(user: AuthenticatedUser): string {
  const phone = user.phone?.trim();
  if (!phone) {
    throw new ForbiddenException('Verified phone is required');
  }
  return phone;
}

function toAuthResponse(
  user: User,
  session: Session | null,
  requireSession: boolean,
): AuthResponse {
  if (requireSession && !session) {
    throw new UnauthorizedException('Invalid or expired authentication session');
  }
  return {
    user: {
      id: user.id,
      email: user.email ?? metadataString(user, 'contact_email'),
      phone: user.phone ?? null,
    },
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    expiresAt: session?.expires_at ?? null,
  };
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

function metadataString(user: User, key: string): string | null {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toAuthException(error: AuthError, fallbackMessage: string): Error {
  if (error.status === 429) {
    return new HttpException(fallbackMessage, 429);
  }
  if (error.status && error.status >= 400 && error.status < 500) {
    return new UnauthorizedException(fallbackMessage);
  }
  return new InternalServerErrorException(fallbackMessage);
}

function createAuthClient(): CatchCatchSupabaseClient {
  return createSupabaseAuthClient();
}
