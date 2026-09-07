import {
  applyTheme,
  applyThemePreference,
  normalizeThemePreference,
  readStoredTheme,
  resolveTheme,
  systemTheme,
} from "./theme.js";

const preference = normalizeThemePreference(readStoredTheme());
applyTheme(resolveTheme(preference, systemTheme() === "dark"));
applyThemePreference(preference);
