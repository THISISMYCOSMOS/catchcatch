import { IsBoolean } from 'class-validator';

export class UpdatePriceAlertEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
