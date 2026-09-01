import { getMockAccountEmail, isMockAccountEmailInUse } from "@/lib/mock/auth";

export type MockUserProfile = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phoneNumber: string | null;
  joinedAt: null;
  profileImageUrl: null;
  loginProvider: null;
};

export type MockUserProfileUpdate = {
  nickname?: string;
  email?: string;
};

type MockProfileOverrides = Record<string, MockUserProfileUpdate>;

const MOCK_PROFILE_STORAGE_KEY = "catchcatch:mock-profile-overrides";

const wait = (milliseconds = 260) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function readMockProfileOverrides(): MockProfileOverrides {
  try {
    const storedProfiles = localStorage.getItem(MOCK_PROFILE_STORAGE_KEY);
    if (!storedProfiles) return {};
    const parsedProfiles: unknown = JSON.parse(storedProfiles);
    if (!parsedProfiles || typeof parsedProfiles !== "object") return {};

    return Object.fromEntries(Object.entries(parsedProfiles).filter((entry): entry is [string, MockUserProfileUpdate] => {
      const profile = entry[1];
      return Boolean(profile)
        && typeof profile === "object"
        && (!("nickname" in profile) || typeof profile.nickname === "string")
        && (!("email" in profile) || typeof profile.email === "string");
    }));
  } catch {
    return {};
  }
}

function createMockUserProfile(username: string): MockUserProfile {
  const profileOverride = readMockProfileOverrides()[username];
  return {
    id: username,
    username,
    nickname: profileOverride?.nickname ?? null,
    email: profileOverride?.email ?? getMockAccountEmail(username),
    phoneNumber: null,
    joinedAt: null,
    profileImageUrl: null,
    loginProvider: null,
  };
}

export async function getMockUserProfile(username: string): Promise<MockUserProfile | null> {
  await wait();
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) return null;

  return createMockUserProfile(normalizedUsername);
}

export async function updateMockUserProfile(username: string, update: MockUserProfileUpdate) {
  await wait(420);
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedUpdate: MockUserProfileUpdate = {};
  const normalizedNickname = update.nickname?.trim();
  const normalizedEmail = update.email?.trim().toLowerCase();
  if (normalizedNickname) normalizedUpdate.nickname = normalizedNickname;
  if (normalizedEmail) normalizedUpdate.email = normalizedEmail;
  if (!normalizedUpdate.nickname && !normalizedUpdate.email) {
    return { ok: false as const, reason: "no_changes" as const };
  }
  const profileOverrides = readMockProfileOverrides();
  const hasDuplicateOverride = Boolean(normalizedUpdate.email) && Object.entries(profileOverrides).some(([profileUsername, profile]) => (
    profileUsername !== normalizedUsername
    && profile.email?.toLowerCase() === normalizedUpdate.email
  ));

  if (
    normalizedUpdate.email
    && (hasDuplicateOverride || isMockAccountEmailInUse(normalizedUpdate.email, normalizedUsername))
  ) {
    return { ok: false as const, reason: "duplicate_email" as const };
  }

  try {
    localStorage.setItem(MOCK_PROFILE_STORAGE_KEY, JSON.stringify({
      ...profileOverrides,
      [normalizedUsername]: {
        ...profileOverrides[normalizedUsername],
        ...normalizedUpdate,
      },
    }));
    return { ok: true as const, profile: createMockUserProfile(normalizedUsername) };
  } catch {
    return { ok: false as const, reason: "storage_error" as const };
  }
}
