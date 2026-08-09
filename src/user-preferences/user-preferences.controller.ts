import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { assertOwnUserId } from '../auth/ownership';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UserPreferencesService } from './user-preferences.service';

@UseGuards(AuthGuard)
@Controller('user-preferences')
export class UserPreferencesController {
  constructor(private readonly service: UserPreferencesService) {}

  @Put(':userId')
  update(
    @Param('userId') userId: string,
    @Body() body: UpdateUserPreferencesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.update(userId, body);
  }

  @Get(':userId')
  findByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.findByUserId(userId);
  }
}
