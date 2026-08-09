import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.guard';
import { AuthenticatedUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error('Current user is unavailable');
    }
    return request.user;
  },
);
