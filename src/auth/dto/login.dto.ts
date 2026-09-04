import { IsNotEmpty, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(4, 12)
  @Matches(/^[A-Za-z0-9]+$/)
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
