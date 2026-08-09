import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SavedProductsController } from './saved-products.controller';
import { SavedProductsService } from './saved-products.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SavedProductsController],
  providers: [SavedProductsService],
  exports: [SavedProductsService],
})
export class SavedProductsModule {}
