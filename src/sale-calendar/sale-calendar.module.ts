import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SaleCalendarController } from './sale-calendar.controller';
import { SaleCalendarService } from './sale-calendar.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SaleCalendarController],
  providers: [SaleCalendarService],
})
export class SaleCalendarModule {}
