import { createHmac, timingSafeEqual } from "node:crypto";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createVisitorToken(visitorId: string, secret: string) {
  return `${visitorId}.${signVisitorId(visitorId, secret)}`;
}

export function readVisitorId(token: string | undefined, secret: string) {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;

  const visitorId = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!uuidPattern.test(visitorId)) return null;

  const expected = Buffer.from(signVisitorId(visitorId, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  return visitorId;
}

function signVisitorId(visitorId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`dialup-diaries:visitor:${visitorId}`)
    .digest("base64url");
}
