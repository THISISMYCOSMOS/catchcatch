import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePriceAlertDto } from './dto/create-price-alert.dto';
import { UpdatePriceAlertEnabledDto } from './dto/update-price-alert-enabled.dto';
import { PriceAlertsService } from './price-alerts.service';

@Controller('price-alerts')
export class PriceAlertsController {
  constructor(private readonly service: PriceAlertsService) {}

  @Post()
  create(@Body() body: CreatePriceAlertDto) {
    return this.service.create(body.userId, body.productId, body.targetPrice ?? null);
  }

  @Get(':userId')
  findByUserId(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }

  @Patch(':alertId/enabled')
  updateEnabled(
    @Param('alertId') alertId: string,
    @Body() body: UpdatePriceAlertEnabledDto,
  ) {
    return this.service.updateEnabled(alertId, body.enabled);
  }
}
