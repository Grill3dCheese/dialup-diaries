export const themeStorageKey = "dialup-diaries-theme";
export const lightThemeColor = "#fff6d8";
export const darkThemeColor = "#08070d";

export function normalizeThemePreference(storedTheme) {
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    return storedTheme;
  }
  return "system";
}

export function resolveTheme(storedTheme, systemPrefersDark) {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return systemPrefersDark ? "dark" : "light";
}

export function readStoredTheme() {
  try {
    return window.localStorage.getItem(themeStorageKey);
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme) {
  if (theme !== "light" && theme !== "dark" && theme !== "system") return;
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The theme still works when storage is unavailable.
  }
}

export function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = theme === "dark" ? darkThemeColor : lightThemeColor;
  }
}

export function applyThemePreference(preference) {
  document.documentElement.dataset.themePreference =
    normalizeThemePreference(preference);
}
