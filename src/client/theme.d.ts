export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const themeStorageKey: "dialup-diaries-theme";
export const lightThemeColor: "#fff6d8";
export const darkThemeColor: "#08070d";

export function normalizeThemePreference(
  storedTheme: string | null,
): ThemePreference;
export function resolveTheme(storedTheme: string | null, systemPrefersDark: boolean): Theme;
export function readStoredTheme(): string | null;
export function writeStoredTheme(theme: ThemePreference): void;
export function systemTheme(): Theme;
export function applyTheme(theme: Theme): void;
export function applyThemePreference(preference: string | null): void;
