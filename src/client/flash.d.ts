export type FlashKind = "success" | "error" | "warning" | "info";

export const FLASH_DURATION_MS: 4000;
export const FLASH_ERROR_DURATION_MS: 6000;
export const FLASH_FADE_MS: 180;

export function flashKindFromClassName(className: string): FlashKind;
export function durationForFlashKind(kind: FlashKind): number;
export function armFlash(element: object): void;
export function armAllFlashes(root?: object): void;
export function dismissFlash(
  element: object,
  options?: { immediate?: boolean },
): void;
export function showToast(message: string, kind?: FlashKind): void;
