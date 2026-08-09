import { Global, Module } from '@nestjs/common';
import { InternalApiGuard } from './internal-api.guard';

@Global()
@Module({
  providers: [InternalApiGuard],
  exports: [InternalApiGuard],
})
export class InternalAuthModule {}
