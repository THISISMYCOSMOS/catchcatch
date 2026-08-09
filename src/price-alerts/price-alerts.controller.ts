import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { assertOwnUserId } from '../auth/ownership';
import { CreatePriceAlertDto } from './dto/create-price-alert.dto';
import { UpdatePriceAlertEnabledDto } from './dto/update-price-alert-enabled.dto';
import { PriceAlertsService } from './price-alerts.service';

@UseGuards(AuthGuard)
@Controller('price-alerts')
export class PriceAlertsController {
  constructor(private readonly service: PriceAlertsService) {}

  @Post()
  create(
    @Body() body: CreatePriceAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.id, body.productId, body.targetPrice ?? null);
  }

  @Get(':userId')
  findByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.findByUserId(userId);
  }

  @Patch(':alertId/enabled')
  updateEnabled(
    @Param('alertId') alertId: string,
    @Body() body: UpdatePriceAlertEnabledDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateEnabledForUser(user.id, alertId, body.enabled);
  }
}
