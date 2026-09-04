import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SendPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  captchaToken?: string;
}
