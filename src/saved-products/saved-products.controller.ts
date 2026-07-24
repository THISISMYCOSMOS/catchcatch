import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateSavedProductDto } from './dto/create-saved-product.dto';
import { SavedProductsService } from './saved-products.service';

@Controller('saved-products')
export class SavedProductsController {
  constructor(private readonly service: SavedProductsService) {}

  @Post()
  save(@Body() body: CreateSavedProductDto) {
    return this.service.save(body.userId, body.productId);
  }

  @Get(':userId')
  findByUserId(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }

  @Delete(':userId/:productId')
  remove(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.remove(userId, productId);
  }
}
