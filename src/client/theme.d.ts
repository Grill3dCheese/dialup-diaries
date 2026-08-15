export type Theme = "light" | "dark";

export const themeStorageKey: "dialup-diaries-theme";
export const lightThemeColor: "#fff6d8";
export const darkThemeColor: "#08070d";

export function resolveTheme(storedTheme: string | null, systemPrefersDark: boolean): Theme;
export function readStoredTheme(): string | null;
export function writeStoredTheme(theme: Theme): void;
export function systemTheme(): Theme;
export function applyTheme(theme: Theme): void;
