import { Controller, Get, Query } from '@nestjs/common';
import { SaleCalendarService } from './sale-calendar.service';

@Controller('sale-calendar')
export class SaleCalendarController {
  constructor(private readonly service: SaleCalendarService) {}

  @Get()
  find(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.find(status, limit);
  }
}
