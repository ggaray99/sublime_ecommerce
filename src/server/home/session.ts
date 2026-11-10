import { cacheLife, cacheTag } from "next/cache";
import { getSql, hasDatabase } from "../db/client.ts";
import { createHomeRepository, DEFAULT_HERO, type HomeHero } from "./settings.ts";

/** Invalidated with updateTag() when /admin/portada saves. */
export const HOME_TAG = "home";

export const getHomeRepository = () => createHomeRepository(getSql());

/** Hero content for the home page; the defaults where there is no database. */
export async function getHomeHero(): Promise<HomeHero> {
  "use cache";
  cacheTag(HOME_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return DEFAULT_HERO;
  }
  // Saving from the admin refreshes it immediately; the lifetime is only a safety net.
  cacheLife("hours");
  return getHomeRepository().getHero();
}
