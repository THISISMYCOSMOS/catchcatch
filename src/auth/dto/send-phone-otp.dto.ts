import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SendPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsIn(['login', 'signup'])
  purpose!: 'login' | 'signup';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  captchaToken?: string;
}
