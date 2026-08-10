import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { InternalApiGuard } from './internal-api.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, InternalApiGuard],
  exports: [AuthService, AuthGuard, InternalApiGuard],
})
export class AuthModule {}
