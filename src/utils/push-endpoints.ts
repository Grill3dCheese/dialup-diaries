import { isIP } from "node:net";

const pushServiceHostSuffixes = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "updates-autopush.prod.mozaws.net",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
  "wns.windows.com",
] as const;

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  if (url.hostname.includes("..")) return false;
  if (isIP(url.hostname) !== 0) return false;

  const hostname = url.hostname.toLowerCase();
  return pushServiceHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}
