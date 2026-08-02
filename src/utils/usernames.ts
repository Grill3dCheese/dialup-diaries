const maxUsernameLength = 24;
const usernamePattern = /^[a-z0-9_]+$/;

export function buildUsernameCandidates(username: string) {
  const base = username.toLowerCase();
  const candidates = new Set<string>();
  const add = (candidate: string) => {
    const normalized = candidate.toLowerCase().slice(0, maxUsernameLength);
    if (normalized !== base && normalized.length >= 3 && usernamePattern.test(normalized)) {
      candidates.add(normalized);
    }
  };
  const withSuffix = (suffix: string) =>
    `${base.slice(0, maxUsernameLength - suffix.length)}${suffix}`;

  add(username.replace(/([a-z0-9])([A-Z])/g, "$1_$2"));
  add(toLeetspeak(base));
  add(withSuffix("0"));
  add(withSuffix("123"));
  add(withSuffix("_online"));
  add(withSuffix("2000"));
  add(withSuffix("_88"));
  add(`x_${base.slice(0, maxUsernameLength - 4)}_x`);
  add(withSuffix("dotcom"));

  for (let number = 1; number <= 30; number += 1) {
    add(withSuffix(String(number)));
  }

  return [...candidates];
}

function toLeetspeak(username: string) {
  const replacements: Record<string, string> = {
    a: "4",
    e: "3",
    i: "1",
    o: "0",
    s: "5",
  };
  for (let index = username.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[username[index] ?? ""];
    if (replacement) {
      return `${username.slice(0, index)}${replacement}${username.slice(index + 1)}`;
    }
  }

  return username;
}
