import { Equals, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  token!: string;

  @IsString()
  @Length(4, 12)
  @Matches(/^[A-Za-z0-9]+$/)
  accountId!: string;

  @IsString()
  @Length(8, 16)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S+$/)
  password!: string;

  @Equals(true)
  acceptTerms!: boolean;
}
