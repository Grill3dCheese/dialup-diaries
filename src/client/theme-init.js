import { applyTheme, readStoredTheme, resolveTheme, systemTheme } from "./theme.js";

applyTheme(resolveTheme(readStoredTheme(), systemTheme() === "dark"));
