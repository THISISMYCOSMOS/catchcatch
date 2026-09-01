import { IsString, Matches } from 'class-validator';

export class WithdrawAccountDto {
  @IsString()
  @Matches(/^\d{6}$/)
  token!: string;
}
