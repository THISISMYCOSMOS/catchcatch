import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { validateSelectedCriteria } from '../domain/calculations';
import { Row } from '../database/database.types';
import {
  UserCardRepository,
  UserMembershipRepository,
  UserPreferenceRepository,
  UserShoppingGradeRepository,
} from '../database/repositories/repository.interfaces';
import {
  USER_CARD_REPOSITORY,
  USER_MEMBERSHIP_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
  USER_SHOPPING_GRADE_REPOSITORY,
} from '../database/repositories/repository.tokens';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

export type UserPreferencesResponse = {
  id: string;
  userId: string;
  selectedCriteria: string[];
  memberships: UserMembershipResponse[];
  shoppingGrades: UserShoppingGradeResponse[];
  cards: UserCardResponse[];
  createdAt: string;
  updatedAt: string;
};

export type UserMembershipResponse = {
  provider: string;
  membershipType: string;
  enabled: boolean;
};

export type UserShoppingGradeResponse = {
  provider: string;
  grade: string;
};

export type UserCardResponse = {
  issuer: string;
  cardProductCode: string;
};

@Injectable()
export class UserPreferencesService {
  constructor(
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(USER_MEMBERSHIP_REPOSITORY)
    private readonly memberships: UserMembershipRepository,
    @Inject(USER_SHOPPING_GRADE_REPOSITORY)
    private readonly shoppingGrades: UserShoppingGradeRepository,
    @Inject(USER_CARD_REPOSITORY)
    private readonly cards: UserCardRepository,
  ) {}

  async update(
    userId: string,
    input: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const criteria = this.parseCriteria(input.selectedCriteria);
    const row = await this.preferences.upsert({
      user_id: userId,
      selected_criteria: criteria,
    });
    const [memberships, shoppingGrades, cards] = await Promise.all([
      this.memberships.replaceForUser(userId, (input.memberships ?? []).map((membership) => ({
        user_id: userId,
        provider: membership.provider,
        membership_type: membership.membershipType,
        enabled: membership.enabled,
      }))),
      this.shoppingGrades.replaceForUser(userId, (input.shoppingGrades ?? []).map((grade) => ({
        user_id: userId,
        provider: grade.provider,
        grade: grade.grade,
      }))),
      this.cards.replaceForUser(userId, (input.cards ?? []).map((card) => ({
        user_id: userId,
        issuer: card.issuer,
        card_product_code: card.cardProductCode,
      }))),
    ]);
    return toUserPreferencesResponse(row, memberships, shoppingGrades, cards);
  }

  async findByUserId(userId: string): Promise<UserPreferencesResponse> {
    const row = await this.preferences.findByUserId(userId);
    if (!row) {
      throw new NotFoundException(`User preferences not found: ${userId}`);
    }
    const [memberships, shoppingGrades, cards] = await Promise.all([
      this.memberships.findByUserId(userId),
      this.shoppingGrades.findByUserId(userId),
      this.cards.findByUserId(userId),
    ]);
    return toUserPreferencesResponse(row, memberships, shoppingGrades, cards);
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
  memberships: Row<'user_memberships'>[],
  shoppingGrades: Row<'user_shopping_grades'>[],
  cards: Row<'user_cards'>[],
): UserPreferencesResponse {
  return {
    id: row.id,
    userId: row.user_id,
    selectedCriteria: row.selected_criteria,
    memberships: memberships.map((membership) => ({
      provider: membership.provider,
      membershipType: membership.membership_type,
      enabled: membership.enabled,
    })),
    shoppingGrades: shoppingGrades.map((grade) => ({
      provider: grade.provider,
      grade: grade.grade,
    })),
    cards: cards.map((card) => ({
      issuer: card.issuer,
      cardProductCode: card.card_product_code,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
