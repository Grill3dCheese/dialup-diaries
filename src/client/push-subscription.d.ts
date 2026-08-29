export type BrowserPlatform =
  "chrome" | "firefox" | "safari" | "edge" | "other";

export function pushSupported(): boolean;
export function isIosUserAgent(userAgent?: string): boolean;
export function isStandaloneDisplay(): boolean;
export function detectBrowserPlatform(userAgent?: string): BrowserPlatform;
export function urlBase64ToUint8Array(base64String: string): Uint8Array;
export function initPushSubscription(options: {
  csrfToken: string;
  onError?: (message: string) => void;
}): { supported: boolean };
export function resetAppBadgeContext(options?: {
  csrfToken?: string;
}): Promise<void>;
