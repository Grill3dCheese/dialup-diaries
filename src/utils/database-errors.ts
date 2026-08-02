type ErrorWithDetails = {
  cause?: unknown;
  code?: unknown;
  constraint?: unknown;
};

export function isUsernameConflict(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isErrorWithDetails(current)) return false;
    if (
      current.code === "23505" &&
      (current.constraint === undefined || current.constraint === "users_username_lower_idx")
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
