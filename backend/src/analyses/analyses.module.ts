import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AnalysesController],
  providers: [AnalysesService],
  exports: [AnalysesService],
})
export class AnalysesModule {}
