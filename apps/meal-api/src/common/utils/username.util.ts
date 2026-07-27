const USERNAME_REGEX = /^[a-z0-9][a-z0-9._]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_REGEX.test(normalizeUsername(raw));
}

export const USERNAME_POLICY_MESSAGE =
  'Username must be 3–32 characters: letters, numbers, dots, or underscores (start with a letter or number)';
