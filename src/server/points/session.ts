import { cacheLife, cacheTag } from "next/cache";
import { getSql, hasDatabase } from "../db/client.ts";
import { createPointRepository, type PointOfSale, type PointRepository } from "./repository.ts";

/** Invalidated with updateTag() by every change made from /admin/puntos. */
export const POINTS_TAG = "points";

export const pointsAvailable = (): boolean => hasDatabase();

export function getPointRepository(): PointRepository {
  return createPointRepository(getSql());
}

/** Active points for the public page. Without a database there are none to show. */
export async function getPublicPoints(): Promise<PointOfSale[]> {
  "use cache";
  cacheTag(POINTS_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return [];
  }
  // Admin changes refresh it immediately; the lifetime is only a safety net.
  cacheLife("hours");
  return getPointRepository().list({ activeOnly: true });
}
