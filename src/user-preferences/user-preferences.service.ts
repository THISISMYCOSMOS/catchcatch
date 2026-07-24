import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { validateSelectedCriteria } from '../domain/calculations';
import { Row } from '../database/database.types';
import { UserPreferenceRepository } from '../database/repositories/repository.interfaces';
import { USER_PREFERENCE_REPOSITORY } from '../database/repositories/repository.tokens';

export type UserPreferencesResponse = {
  id: string;
  userId: string;
  selectedCriteria: string[];
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UserPreferencesService {
  constructor(
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
  ) {}

  async update(
    userId: string,
    selectedCriteria: readonly string[],
  ): Promise<UserPreferencesResponse> {
    const criteria = this.parseCriteria(selectedCriteria);
    const row = await this.preferences.upsert({
      user_id: userId,
      selected_criteria: criteria,
    });
    return toUserPreferencesResponse(row);
  }

  async findByUserId(userId: string): Promise<UserPreferencesResponse> {
    const row = await this.preferences.findByUserId(userId);
    if (!row) {
      throw new NotFoundException(`User preferences not found: ${userId}`);
    }
    return toUserPreferencesResponse(row);
  }

  private parseCriteria(criteria: readonly string[]) {
    try {
      return validateSelectedCriteria(criteria);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid criteria');
    }
  }
}

function toUserPreferencesResponse(
  row: Row<'user_preferences'>,
): UserPreferencesResponse {
  return {
    id: row.id,
    userId: row.user_id,
    selectedCriteria: row.selected_criteria,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
