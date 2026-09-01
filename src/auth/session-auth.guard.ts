import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedRequest, extractAccessToken } from './auth.guard';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractAccessToken(request.headers);
    request.user = await this.auth.verifySessionAccessToken(token);
    request.accessToken = token;
    return true;
  }
}
