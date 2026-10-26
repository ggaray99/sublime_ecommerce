import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Admin preview of a closed store. An admin action sets a signed cookie
 * ("<expiry>.<hmac>", keyed from BETTER_AUTH_SECRET); the proxy lets requests
 * carrying a valid one see the real store. A second, readable cookie only tells
 * the page to show the "Vista previa" bar: it grants nothing by itself.
 */
export const PREVIEW_COOKIE = "sublime_preview";
export const PREVIEW_FLAG_COOKIE = "sublime_preview_on";
export const PREVIEW_DAYS = 7;

const key = (secret: string) => createHmac("sha256", secret).update("sublime-store-preview").digest();
const sign = (secret: string, expires: string) => createHmac("sha256", key(secret)).update(expires).digest("base64url");

export function createPreviewToken(secret: string, now = Date.now()): string {
  const expires = String(now + PREVIEW_DAYS * 86_400_000);
  return `${expires}.${sign(secret, expires)}`;
}

export function verifyPreviewToken(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || !/^\d{13}$/.test(expires) || Number(expires) < now) return false;
  const expected = Buffer.from(sign(secret, expires));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
