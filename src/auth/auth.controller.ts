import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { CurrentAccessToken } from './current-access-token.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('signup')
  signup(@Body() body: SignupDto) {
    return this.service.signup(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.service.login(body);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.service.refresh(body);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logout(@CurrentAccessToken() accessToken: string) {
    return this.service.logout(accessToken);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
