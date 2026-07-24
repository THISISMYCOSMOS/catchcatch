import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UserPreferencesService } from './user-preferences.service';

@Controller('user-preferences')
export class UserPreferencesController {
  constructor(private readonly service: UserPreferencesService) {}

  @Put(':userId')
  update(
    @Param('userId') userId: string,
    @Body() body: UpdateUserPreferencesDto,
  ) {
    return this.service.update(userId, body.selectedCriteria);
  }

  @Get(':userId')
  findByUserId(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }
}
