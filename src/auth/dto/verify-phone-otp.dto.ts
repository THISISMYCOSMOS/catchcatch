import { IsBoolean, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  token!: string;

  @IsBoolean()
  acceptTerms!: boolean;
}
