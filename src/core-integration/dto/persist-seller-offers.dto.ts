import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { ComparisonStatus, OfficialSellerStatus, ReturnPolicyStatus } from '../../domain/types';

const OFFICIAL_SELLER_STATUSES: OfficialSellerStatus[] = [
  'confirmed_official',
  'confirmed_non_official',
  'unconfirmed',
];
const RETURN_POLICY_STATUSES: ReturnPolicyStatus[] = ['confirmed', 'unconfirmed'];
const COMPARISON_STATUSES: ComparisonStatus[] = [
  'DIRECTLY_COMPARABLE',
  'UNIT_COMPARABLE',
  'NOT_COMPARABLE',
  'UNKNOWN',
];

export class PersistSellerOfferDto {
  @IsString()
  @IsNotEmpty()
  sellerName!: string;

  @IsUrl()
  sellerUrl!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  listedPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  listedSalePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketEffectivePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  publicDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  automaticDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardValue?: number;

  @IsOptional()
  @IsIn(OFFICIAL_SELLER_STATUSES)
  officialSellerStatus?: OfficialSellerStatus;

  @IsOptional()
  @IsIn(RETURN_POLICY_STATUSES)
  returnPolicyStatus?: ReturnPolicyStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryDays?: number;

  @IsOptional()
  @IsIn(COMPARISON_STATUSES)
  comparisonStatus?: ComparisonStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  observedAt?: string;
}

export class PersistSellerOffersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersistSellerOfferDto)
  offers!: PersistSellerOfferDto[];
}
