import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UpdateUserPreferencesDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  selectedCriteria!: string[];
}
