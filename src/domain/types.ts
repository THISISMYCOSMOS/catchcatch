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
  | 'PENDING'
  | 'READY_FOR_JUDGMENT'
  | 'FAILED'
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

// `type` remains the legacy display/category field.  These dimensions are
// deliberately independent: a mini can be paid, a bonus, or unknown, and a
// cosmetic can be the same product, a different product, or unknown.
export type ComponentPhysicalType = 'COSMETIC' | 'NON_COSMETIC' | 'UNKNOWN';
export type CommercialInclusion = 'PAID' | 'BONUS' | 'UNKNOWN';
export type ComponentProductIdentity =
  | 'SAME_PRODUCT'
  | 'DIFFERENT_PRODUCT'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN';
export type VerificationStatus = 'VERIFIED' | 'UNKNOWN';

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
  | 'SOURCE_EVIDENCE_UNVERIFIED'
  | 'SELECTED_OPTION_UNVERIFIED'
  | 'PAID_CONFIGURATION_UNVERIFIED'
  | 'COMPONENT_COMPOSITION_UNVERIFIED'
  | 'DATA_OUTDATED'
  | 'OTHER';

export type ProductComponent = {
  type: ComponentType;
  name?: string | null;
  capacityValue: number | null;
  capacityUnit: CapacityUnit | null;
  quantity: number | null;
  physicalType?: ComponentPhysicalType;
  commercialInclusion?: CommercialInclusion;
  productIdentity?: ComponentProductIdentity;
  verificationStatus?: VerificationStatus;
};

export type SellerOffer = {
  id: string;
  productKey: string;
  userEffectivePrice: number | null;
  components: readonly ProductComponent[];
  officialSellerStatus: OfficialSellerStatus;
  returnPolicyStatus: ReturnPolicyStatus;
  deliveryDays: number | null;
  packageType: PackageType;
  sourceVerificationStatus?: VerificationStatus;
  selectedOptionVerificationStatus?: VerificationStatus;
  paidConfigurationVerificationStatus?: VerificationStatus;
};

export type OfferComparisonResult = {
  offerId: string;
  comparisonStatus: ComparisonStatus;
};

export type PriceHistoryPoint = {
  observedAt: Date;
  marketEffectivePrice: number | null;
};

export type AllowedConclusion = Verdict;

export type DeliverySpeedStatus = 'FAST' | 'NORMAL' | 'SLOW' | 'UNKNOWN';

export type UserMembership = {
  provider: string;
  membershipType: string;
  enabled: boolean;
};

export type UserShoppingGrade = {
  provider: string;
  grade: string;
};

export type UserCardBenefit = {
  issuer: string;
  cardProductCode: string;
};
