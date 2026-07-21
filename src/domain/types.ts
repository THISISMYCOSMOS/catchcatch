export const USER_CRITERIA = [
  'FINAL_PAYMENT_AMOUNT',
  'PURCHASE_TIMING',
  'UNIT_PRICE',
  'SET_AND_GIFTS',
  'RIGHT_SIZED_PURCHASE',
  'SIMPLE_DISCOUNT',
  'FAST_DELIVERY',
  'REWARDS_AND_MEMBERSHIP',
] as const;

export type UserCriterion = typeof USER_CRITERIA[number];

export type Verdict =
  | 'LOW_POINT_BUY'
  | 'NEAR_REGULAR_PRICE'
  | 'REASONABLE_BUY';

export type AnalysisStatus =
  | 'COMPLETED'
  | 'NEEDS_MORE_DATA'
  | 'INVALID_LINK'
  | 'PRODUCT_MISMATCH'
  | 'AI_JUDGMENT_FAILED'
  | 'INTERNAL_ERROR';

export type PackageType = 'single' | 'set' | 'bundle' | 'unknown';

export type ComponentType =
  | 'MAIN'
  | 'REFILL'
  | 'MINI'
  | 'TRAVEL'
  | 'OTHER_COSMETIC'
  | 'NON_COSMETIC_GIFT'
  | 'UNKNOWN';

export type CapacityUnit = 'ML' | 'G';

export type ComparisonStatus =
  | 'DIRECTLY_COMPARABLE'
  | 'UNIT_COMPARABLE'
  | 'NOT_COMPARABLE'
  | 'UNKNOWN';

export type OfficialSellerStatus =
  | 'confirmed_official'
  | 'confirmed_non_official'
  | 'unconfirmed';

export type ReturnPolicyStatus = 'confirmed' | 'unconfirmed';

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';

export type CriterionStatus = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN';

export type WarningCode =
  | 'PRICE_HISTORY_INSUFFICIENT'
  | 'LOW_MATCH_CONFIDENCE'
  | 'COUPON_CONDITION_UNCONFIRMED'
  | 'SHIPPING_FEE_UNCONFIRMED'
  | 'OFFICIAL_SELLER_UNCONFIRMED'
  | 'RETURN_POLICY_UNCONFIRMED'
  | 'OPTION_CONFIRMATION_REQUIRED'
  | 'COMPOSITION_UNCLEAR'
  | 'DATA_OUTDATED'
  | 'OTHER';

export type ProductComponent = {
  type: ComponentType;
  capacityValue: number | null;
  capacityUnit: CapacityUnit | null;
  quantity: number | null;
};
