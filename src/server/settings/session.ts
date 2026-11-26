import { cacheLife, cacheTag } from "next/cache";
import { getSql, hasDatabase } from "../db/client.ts";
import { createContactRepository, DEFAULT_CONTACT, type ContactSettings } from "./contact.ts";
import { createInstallmentsRepository, DEFAULT_INSTALLMENTS, type InstallmentsSettings } from "./installments.ts";
import { createLabPricingRepository } from "./lab-pricing.ts";
import { createPagesRepository, mergeInfoPage, type InfoPageSlug } from "./pages.ts";
import { infoPages, type InfoPageContent } from "../../data/site.ts";
import { createStoreStatusRepository } from "../store-status.ts";
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

export const getPagesRepository = () => createPagesRepository(getSql());

/** An informational page with the text saved from /admin/ajustes, or the default text. */
export async function getInfoPage(slug: InfoPageSlug): Promise<InfoPageContent> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return infoPages[slug];
  }
  cacheLife("hours");
  return mergeInfoPage(infoPages[slug], await getPagesRepository().get(slug));
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

export const getStoreStatusRepository = () => createStoreStatusRepository(getSql());

export const getInstallmentsRepository = () => createInstallmentsRepository(getSql());

/** Interest-free installments the store advertises; off where there is no database. */
export async function getInstallmentsSettings(): Promise<InstallmentsSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return DEFAULT_INSTALLMENTS;
  }
  cacheLife("hours");
  return getInstallmentsRepository().get();
}
