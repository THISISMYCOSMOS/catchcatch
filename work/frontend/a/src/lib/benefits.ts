export const BENEFITS_STORAGE_KEY = "catchcatch:benefits-by-user";
const BENEFIT_PROMPT_DISMISSED_KEY = "catchcatch:benefit-prompt-dismissed";

export const OLIVE_YOUNG_GRADE_OPTIONS = [
  { id: "notUsing", label: "이용 안 함" },
  { id: "baby", label: "베이비" },
  { id: "pink", label: "핑크" },
  { id: "green", label: "그린" },
  { id: "black", label: "블랙" },
  { id: "gold", label: "골드" },
  { id: "unknown", label: "등급을 모르겠어요" },
] as const;

export const MUSINSA_GRADE_OPTIONS = [
  { id: "notUsing", label: "이용 안 함" },
  { id: "welcome", label: "웰컴" },
  { id: "friends", label: "프렌즈" },
  { id: "family", label: "패밀리" },
  { id: "bronze", label: "브론즈" },
  { id: "silver", label: "실버" },
  { id: "gold", label: "골드" },
  { id: "platinum", label: "플래티넘" },
  { id: "diamond", label: "다이아몬드" },
  { id: "blackDiamond", label: "블랙 다이아몬드" },
  { id: "unknown", label: "등급을 모르겠어요" },
] as const;

export type OliveYoungGrade = (typeof OLIVE_YOUNG_GRADE_OPTIONS)[number]["id"];
export type MusinsaGrade = (typeof MUSINSA_GRADE_OPTIONS)[number]["id"];
export type MembershipId = "coupangWow" | "oliveYoung" | "musinsa" | "other";

export type BenefitProfile = {
  memberships: MembershipId[];
  coupangWow: boolean;
  oliveYoungGrade: OliveYoungGrade;
  musinsaGrade: MusinsaGrade;
  otherMembership: {
    enabled: boolean;
    name: string;
  };
  coupon: {
    enabled: boolean;
    type: "fixed" | "percent";
    value: number;
    maxDiscount: number;
  };
  points: {
    enabled: boolean;
    amount: number;
  };
  paymentDiscount: {
    enabled: boolean;
    method: "card" | "naverPay" | "kakaoPay" | "tossPay" | "other";
    otherMethod: string;
    type: "fixed" | "percent";
    value: number;
    maxDiscount: number;
  };
  noBenefits: boolean;
  completed: boolean;
};

type BenefitsByUsername = Record<string, unknown>;

const OLIVE_YOUNG_GRADES = new Set<string>(OLIVE_YOUNG_GRADE_OPTIONS.map((option) => option.id));
const MUSINSA_GRADES = new Set<string>(MUSINSA_GRADE_OPTIONS.map((option) => option.id));
const OLIVE_YOUNG_LEGACY_GRADES: Record<string, OliveYoungGrade> = {
  베이비: "baby",
  핑크: "pink",
  그린: "green",
  블랙: "black",
  골드: "gold",
  "등급을 모르겠어요": "unknown",
};
const MUSINSA_LEGACY_GRADES: Record<string, MusinsaGrade> = {
  웰컴: "welcome",
  프렌즈: "friends",
  패밀리: "family",
  브론즈: "bronze",
  실버: "silver",
  골드: "gold",
  플래티넘: "platinum",
  다이아몬드: "diamond",
  "블랙 다이아몬드": "blackDiamond",
  "등급을 모르겠어요": "unknown",
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeOliveYoungGrade(value: unknown, hasMembership: boolean): OliveYoungGrade {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (OLIVE_YOUNG_GRADES.has(normalized)) return normalized as OliveYoungGrade;
    if (normalized in OLIVE_YOUNG_LEGACY_GRADES) return OLIVE_YOUNG_LEGACY_GRADES[normalized];
    if (normalized) return "unknown";
  }
  return hasMembership ? "unknown" : "notUsing";
}

function normalizeMusinsaGrade(value: unknown, hasMembership: boolean): MusinsaGrade {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (MUSINSA_GRADES.has(normalized)) return normalized as MusinsaGrade;
    if (normalized in MUSINSA_LEGACY_GRADES) return MUSINSA_LEGACY_GRADES[normalized];
    if (normalized) return "unknown";
  }
  return hasMembership ? "unknown" : "notUsing";
}

export function createDefaultBenefitProfile(): BenefitProfile {
  return {
    memberships: [],
    coupangWow: false,
    oliveYoungGrade: "notUsing",
    musinsaGrade: "notUsing",
    otherMembership: { enabled: false, name: "" },
    coupon: { enabled: false, type: "fixed", value: 0, maxDiscount: 0 },
    points: { enabled: false, amount: 0 },
    paymentDiscount: {
      enabled: false,
      method: "card",
      otherMethod: "",
      type: "fixed",
      value: 0,
      maxDiscount: 0,
    },
    noBenefits: false,
    completed: false,
  };
}

export function normalizeBenefitProfile(value: unknown): BenefitProfile {
  const defaults = createDefaultBenefitProfile();
  if (!value || typeof value !== "object") return defaults;

  const stored = value as Record<string, unknown>;
  const storedMembershipGrades = stored.membershipGrades && typeof stored.membershipGrades === "object"
    ? stored.membershipGrades as Record<string, unknown>
    : {};
  const storedMemberships = Array.isArray(stored.memberships)
    ? stored.memberships.filter((membership): membership is string => typeof membership === "string")
    : [];
  const noBenefits = stored.noBenefits === true;

  if (noBenefits) {
    return {
      ...defaults,
      noBenefits: true,
      completed: stored.completed === true,
    };
  }

  const coupangWow = stored.coupang === true
    || stored.coupangWow === true
    || storedMemberships.includes("coupang")
    || storedMemberships.includes("coupangWow");
  const oliveYoungGrade = normalizeOliveYoungGrade(
    stored.oliveYoungGrade ?? storedMembershipGrades.oliveYoung,
    storedMemberships.includes("oliveYoung"),
  );
  const musinsaGrade = normalizeMusinsaGrade(
    stored.musinsaGrade ?? storedMembershipGrades.musinsa,
    storedMemberships.includes("musinsa"),
  );
  const storedOtherMembership = stored.otherMembership;
  const otherMembership = typeof storedOtherMembership === "string"
    ? { enabled: storedOtherMembership.trim().length > 0, name: storedOtherMembership }
    : storedOtherMembership && typeof storedOtherMembership === "object"
      ? {
          enabled: (storedOtherMembership as Record<string, unknown>).enabled === true,
          name: typeof (storedOtherMembership as Record<string, unknown>).name === "string"
            ? (storedOtherMembership as Record<string, unknown>).name as string
            : "",
        }
      : defaults.otherMembership;
  const memberships: MembershipId[] = [
    ...(coupangWow ? ["coupangWow" as const] : []),
    ...(oliveYoungGrade !== "notUsing" ? ["oliveYoung" as const] : []),
    ...(musinsaGrade !== "notUsing" ? ["musinsa" as const] : []),
    ...(otherMembership.enabled && otherMembership.name.trim() ? ["other" as const] : []),
  ];

  return {
    memberships,
    coupangWow,
    oliveYoungGrade,
    musinsaGrade,
    otherMembership,
    coupon: defaults.coupon,
    points: defaults.points,
    paymentDiscount: defaults.paymentDiscount,
    noBenefits: false,
    completed: stored.completed === true,
  };
}

function readStoredBenefits(): BenefitsByUsername {
  try {
    const stored = localStorage.getItem(BENEFITS_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as BenefitsByUsername
      : {};
  } catch {
    return {};
  }
}

export function getBenefitProfile(username: string) {
  return normalizeBenefitProfile(readStoredBenefits()[normalizeUsername(username)]);
}

export function saveBenefitProfile(username: string, profile: BenefitProfile) {
  const stored = readStoredBenefits();
  const normalizedProfile = normalizeBenefitProfile({
    coupangWow: profile.coupangWow,
    oliveYoungGrade: profile.oliveYoungGrade,
    musinsaGrade: profile.musinsaGrade,
    otherMembership: {
      enabled: profile.otherMembership.enabled,
      name: profile.otherMembership.enabled ? profile.otherMembership.name.trim() : "",
    },
    coupon: { enabled: false, type: "fixed", value: 0, maxDiscount: 0 },
    points: { enabled: false, amount: 0 },
    paymentDiscount: {
      enabled: false,
      method: "card",
      otherMethod: "",
      type: "fixed",
      value: 0,
      maxDiscount: 0,
    },
    noBenefits: false,
    completed: true,
  });

  localStorage.setItem(BENEFITS_STORAGE_KEY, JSON.stringify({
    ...stored,
    [normalizeUsername(username)]: normalizedProfile,
  }));
  clearBenefitPromptDismissal(username);
  return normalizedProfile;
}

export function hasAnyBenefits(profile: BenefitProfile) {
  return profile.coupangWow
    || profile.oliveYoungGrade !== "notUsing"
    || profile.musinsaGrade !== "notUsing"
    || (profile.otherMembership.enabled && profile.otherMembership.name.trim().length > 0);
}

function readDismissedUsernames() {
  try {
    const stored = sessionStorage.getItem(BENEFIT_PROMPT_DISMISSED_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((username): username is string => typeof username === "string")
      : [];
  } catch {
    return [];
  }
}

export function isBenefitPromptDismissed(username: string) {
  return readDismissedUsernames().includes(normalizeUsername(username));
}

export function dismissBenefitPrompt(username: string) {
  const usernames = new Set(readDismissedUsernames());
  usernames.add(normalizeUsername(username));
  sessionStorage.setItem(BENEFIT_PROMPT_DISMISSED_KEY, JSON.stringify([...usernames]));
}

export function clearBenefitPromptDismissal(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const usernames = readDismissedUsernames().filter((storedUsername) => storedUsername !== normalizedUsername);
  if (usernames.length === 0) {
    sessionStorage.removeItem(BENEFIT_PROMPT_DISMISSED_KEY);
    return;
  }
  sessionStorage.setItem(BENEFIT_PROMPT_DISMISSED_KEY, JSON.stringify(usernames));
}
