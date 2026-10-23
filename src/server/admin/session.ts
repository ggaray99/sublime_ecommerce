import { getSessionUser } from "../auth/neon.ts";
import { getSql } from "../db/client.ts";
import { accountsAvailable } from "../customers/session.ts";
import { createAdminRepository, type Admin, type AdminRepository } from "./repository.ts";

/** The admin panel lives wherever customer accounts do (staging/previews today). */
export const adminAvailable = accountsAvailable;

export function getAdminRepository(): AdminRepository {
  return createAdminRepository(getSql());
}

/**
 * The only authorization check for /admin: a signed-in user is an admin when
 * their Neon Auth id is in admin_users. Returns null otherwise.
 */
export async function getCurrentAdmin(): Promise<Admin | null> {
  if (!adminAvailable()) return null;
  const user = await getSessionUser();
  if (!user) return null;
  return getAdminRepository().findAdmin(user.id);
}
