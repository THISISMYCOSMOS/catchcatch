import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from './auth.types';

export function assertOwnUserId(requestedUserId: string, user: AuthenticatedUser): void {
  if (requestedUserId !== user.id) {
    throw new ForbiddenException('Cannot access another user resource');
  }
}
