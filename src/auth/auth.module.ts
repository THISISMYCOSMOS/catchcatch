import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { InternalApiGuard } from './internal-api.guard';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SessionAuthGuard, InternalApiGuard],
  exports: [AuthService, AuthGuard, SessionAuthGuard, InternalApiGuard],
})
export class AuthModule {}
