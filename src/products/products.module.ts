import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';

@Module({
  imports: [AnalysesModule, AuthModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
