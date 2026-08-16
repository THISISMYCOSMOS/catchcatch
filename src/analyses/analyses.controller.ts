import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { assertOwnUserId } from '../auth/ownership';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@UseGuards(AuthGuard)
@Controller('analyses')
export class AnalysesController {
  constructor(private readonly service: AnalysesService) {}

  @Post()
  create(
    @Body() body: CreateAnalysisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create({
      ...body,
      userId: user.id,
    });
  }

  @Get('recent/:userId')
  findRecentByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    assertOwnUserId(userId, user);
    return this.service.findRecentByUserId(userId, limit);
  }

  @Get('recent')
  findRecent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.service.findRecentByUserId(user.id, limit);
  }

  @Get(':analysisId')
  findById(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findByIdForUser(analysisId, user.id);
  }

  @Delete(':analysisId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteById(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deleteForUser(analysisId, user.id);
  }
}
