import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateAnalysisDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  sourceUrl!: string;

  @IsString()
  @IsNotEmpty()
  productId!: string;
}
