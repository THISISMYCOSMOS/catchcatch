import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { CapacityUnit, ComponentType, PackageType } from '../../domain/types';

const COMPONENT_TYPES: ComponentType[] = [
  'MAIN',
  'REFILL',
  'MINI',
  'TRAVEL',
  'OTHER_COSMETIC',
  'NON_COSMETIC_GIFT',
  'UNKNOWN',
];

const CAPACITY_UNITS: CapacityUnit[] = ['ML', 'G'];
const PACKAGE_TYPES: PackageType[] = ['single', 'set', 'bundle', 'unknown'];

export class PersistProductComponentDto {
  @IsIn(COMPONENT_TYPES)
  componentType!: ComponentType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  capacityValue?: number;

  @IsOptional()
  @IsIn(CAPACITY_UNITS)
  capacityUnit?: CapacityUnit;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class PersistProductDto {
  @IsString()
  @IsNotEmpty()
  canonicalName!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brand?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productKey?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsIn(PACKAGE_TYPES)
  packageType?: PackageType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersistProductComponentDto)
  components?: PersistProductComponentDto[];
}
