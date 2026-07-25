import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UserMembershipDto {
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  membershipType!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UserShoppingGradeDto {
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  grade!: string;
}

export class UserCardDto {
  @IsString()
  @IsNotEmpty()
  issuer!: string;

  @IsString()
  @IsNotEmpty()
  cardProductCode!: string;
}

export class UpdateUserPreferencesDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  selectedCriteria!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserMembershipDto)
  memberships?: UserMembershipDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserShoppingGradeDto)
  shoppingGrades?: UserShoppingGradeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserCardDto)
  cards?: UserCardDto[];
}
