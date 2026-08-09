export const MEMBERSHIP_OPTIONS = [
  { id: "coupangWow", label: "쿠팡 와우" },
  { id: "oliveyoung", label: "올리브영 멤버십" },
  { id: "musinsa", label: "무신사 멤버십" },
] as const;

export type MembershipId = (typeof MEMBERSHIP_OPTIONS)[number]["id"];

export type MembershipPreferences = {
  hasNoMemberships: boolean;
  coupangWow: boolean;
  oliveyoung: boolean;
  musinsa: boolean;
};

export const DEFAULT_MEMBERSHIP_PREFERENCES: MembershipPreferences = {
  hasNoMemberships: false,
  coupangWow: false,
  oliveyoung: false,
  musinsa: false,
};

const MEMBERSHIP_STORAGE_KEY = "catchcatch:membership-preferences";

type MembershipPreferencesByUsername = Record<string, unknown>;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function readSelection(value: unknown) {
  if (value === true) return true;
  // Preserve only the selected state from the previous detailed data format.
  return Boolean(value && typeof value === "object" && "selected" in value && value.selected === true);
}

function normalizePreferences(value: unknown): MembershipPreferences {
  if (!value || typeof value !== "object") return DEFAULT_MEMBERSHIP_PREFERENCES;
  const stored = value as Record<string, unknown>;

  return {
    hasNoMemberships: stored.hasNoMemberships === true,
    coupangWow: readSelection(stored.coupangWow),
    oliveyoung: readSelection(stored.oliveyoung),
    musinsa: readSelection(stored.musinsa),
  };
}

function readStoredPreferences(): MembershipPreferencesByUsername {
  try {
    const stored = localStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object"
      ? parsed as MembershipPreferencesByUsername
      : {};
  } catch {
    return {};
  }
}

export function getMembershipPreferences(username: string) {
  return normalizePreferences(readStoredPreferences()[normalizeUsername(username)]);
}

export function saveMembershipPreferences(username: string, preferences: MembershipPreferences) {
  const stored = readStoredPreferences();
  localStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify({
    ...stored,
    [normalizeUsername(username)]: normalizePreferences(preferences),
  }));
}
