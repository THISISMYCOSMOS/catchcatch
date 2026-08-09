import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { assertOwnUserId } from '../auth/ownership';
import { CreateSavedProductDto } from './dto/create-saved-product.dto';
import { SavedProductsService } from './saved-products.service';

@UseGuards(AuthGuard)
@Controller('saved-products')
export class SavedProductsController {
  constructor(private readonly service: SavedProductsService) {}

  @Post()
  save(
    @Body() body: CreateSavedProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.save(user.id, body.productId);
  }

  @Get('me/cards')
  findMyCards(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findCardsByUserId(user.id);
  }

  @Get(':userId/cards')
  findCardsByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.findCardsByUserId(userId);
  }

  @Get(':userId')
  findByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.findByUserId(userId);
  }

  @Delete(':userId/:productId')
  remove(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertOwnUserId(userId, user);
    return this.service.remove(userId, productId);
  }
}
