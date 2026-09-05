import { IsIn, IsNotEmpty, IsObject, IsString, IsUrl } from 'class-validator';

export class ResolveProductDto {
  @IsIn(['product-identification.v1'])
  schemaVersion!: 'product-identification.v1';

  @IsUrl()
  sourceUrl!: string;

  @IsObject()
  identification!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class IngestOffersDto {
  @IsIn(['product-search.v1'])
  schemaVersion!: 'product-search.v1';

  @IsObject()
  search!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class SaveJudgmentDto {
  @IsIn(['ai-judgment.v1'])
  schemaVersion!: 'ai-judgment.v1';

  @IsObject()
  judgment!: Record<string, unknown>;
}

export class SaveAlternativeConfigurationsDto {
  @IsIn(['product-configuration-search.v1'])
  schemaVersion!: 'product-configuration-search.v1';

  @IsObject()
  search!: Record<string, unknown>;
}
