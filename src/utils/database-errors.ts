type ErrorWithDetails = {
  cause?: unknown;
  code?: unknown;
  constraint?: unknown;
};

export function isUsernameConflict(error: unknown) {
  return isUniqueConflict(error, "users_username_lower_idx");
}

export function isChangelogVersionConflict(error: unknown) {
  return isUniqueConflict(error, "changelog_releases_version_idx");
}

export function isUniqueConflict(error: unknown, constraint: string) {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isErrorWithDetails(current)) return false;
    if (
      current.code === "23505" &&
      (current.constraint === undefined || current.constraint === constraint)
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function isErrorWithDetails(value: unknown): value is ErrorWithDetails {
  return typeof value === "object" && value !== null;
}
