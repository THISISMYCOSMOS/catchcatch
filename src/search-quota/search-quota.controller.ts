import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SearchQuotaService } from './search-quota.service';

@UseGuards(AuthGuard)
@Controller('search-quota')
export class SearchQuotaController {
  constructor(private readonly service: SearchQuotaService) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findForUser(user.id);
  }
}
