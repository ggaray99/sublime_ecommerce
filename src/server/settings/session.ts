import { cacheLife, cacheTag } from "next/cache";
import { getSql, hasDatabase } from "../db/client.ts";
import { createContactRepository, DEFAULT_CONTACT, type ContactSettings } from "./contact.ts";
import { createLabPricingRepository } from "./lab-pricing.ts";
import { DEFAULT_LAB_PRICING, type LabPricing } from "../../lib/lab/pricing.ts";

/** Invalidated with updateTag() when /admin/ajustes saves. */
export const SETTINGS_TAG = "settings";

export const getContactRepository = () => createContactRepository(getSql());

/** For public pages (WhatsApp links); defaults where there is no database. */
export async function getContactSettings(): Promise<ContactSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return DEFAULT_CONTACT;
  }
  cacheLife("hours");
  return getContactRepository().get();
}

export const getLabPricingRepository = () => createLabPricingRepository(getSql());

/** Sheet price and tiers for the sticker editor estimate. */
export async function getLabPricing(): Promise<LabPricing> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return DEFAULT_LAB_PRICING;
  }
  cacheLife("hours");
  return getLabPricingRepository().get();
}
