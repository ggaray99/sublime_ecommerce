import { getSessionUser } from "../auth/server.ts";
import { getSql } from "../db/client.ts";
import { accountsAvailable } from "../customers/session.ts";
import { createCategoryRepository } from "./categories-repository.ts";
import { createApiKeyRepository } from "../api/keys.ts";
import { createImageRepository } from "./images-repository.ts";
import { createVariantRepository } from "./variants-repository.ts";
import { createAdminRepository, type Admin, type AdminRepository } from "./repository.ts";

/** The admin panel lives wherever customer accounts do (staging/previews today). */
export const adminAvailable = accountsAvailable;

export function getAdminRepository(): AdminRepository {
  return createAdminRepository(getSql());
}

export const getCategoryRepository = () => createCategoryRepository(getSql());
export const getImageRepository = () => createImageRepository(getSql());
export const getApiKeyRepository = () => createApiKeyRepository(getSql());
export const getVariantRepository = () => createVariantRepository(getSql());

/**
 * The only authorization check for /admin: a signed-in user is an admin when
 * their account id is in admin_users. Returns null otherwise.
 */
export async function getCurrentAdmin(): Promise<Admin | null> {
  if (!adminAvailable()) return null;
  const user = await getSessionUser();
  if (!user) return null;
  return getAdminRepository().findAdmin(user.id);
}
