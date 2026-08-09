import { Inject, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../database/supabase.client';
import { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export type AuthUserResponse = {
  id: string;
  email: string | null;
};

export type AuthResponse = {
  user: AuthUserResponse;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async signup(input: SignupDto): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: input.displayName
        ? { data: { display_name: input.displayName } }
        : undefined,
    });
    if (error) {
      throw toAuthException(error, 'Failed to sign up');
    }
    if (!data.user) {
      throw new InternalServerErrorException('Signup returned no user');
    }
    return toAuthResponse(data.user, data.session, false);
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!data.user || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return toAuthResponse(data.user, data.session, true);
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  }
}

function toAuthResponse(
  user: User,
  session: Session | null,
  requireSession: boolean,
): AuthResponse {
  if (requireSession && !session) {
    throw new UnauthorizedException('Invalid email or password');
  }
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    expiresAt: session?.expires_at ?? null,
  };
}

function toAuthException(error: AuthError, fallbackMessage: string): Error {
  if (error.status && error.status >= 400 && error.status < 500) {
    return new UnauthorizedException(fallbackMessage);
  }
  return new InternalServerErrorException(fallbackMessage);
}
