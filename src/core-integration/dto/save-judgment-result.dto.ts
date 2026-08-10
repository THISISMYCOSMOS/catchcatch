import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { AllowedConclusion, Verdict, WarningCode } from '../../domain/types';
import { Json } from '../../database/database.types';

const VERDICTS: Verdict[] = [
  'LOW_POINT_BUY',
  'NEAR_REGULAR_PRICE',
  'REASONABLE_BUY',
];

const WARNING_CODES: WarningCode[] = [
  'PRICE_HISTORY_INSUFFICIENT',
  'LOW_MATCH_CONFIDENCE',
  'COUPON_CONDITION_UNCONFIRMED',
  'SHIPPING_FEE_UNCONFIRMED',
  'OFFICIAL_SELLER_UNCONFIRMED',
  'RETURN_POLICY_UNCONFIRMED',
  'OPTION_CONFIRMATION_REQUIRED',
  'COMPOSITION_UNCLEAR',
  'DATA_OUTDATED',
  'OTHER',
];

export class SaveJudgmentResultDto {
  @IsOptional()
  @IsIn(VERDICTS)
  verdict?: Verdict | null;

  @IsOptional()
  @IsArray()
  @IsIn(VERDICTS, { each: true })
  allowedConclusions?: AllowedConclusion[];

  @IsOptional()
  @IsArray()
  @IsIn(WARNING_CODES, { each: true })
  warningCodes?: WarningCode[];

  @IsObject()
  resultJson!: Json & Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  promptVersion?: string;
}
