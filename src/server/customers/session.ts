import { cache } from "react";
import { isAuthEnabled } from "../auth/config.ts";
import { getSessionUser } from "../auth/server.ts";
import { getSql, hasDatabase } from "../db/client.ts";
import { createCustomerRepository, type Customer, type CustomerRepository } from "./repository.ts";

/** Customer accounts need both Better Auth and the database (staging today). */
export function accountsAvailable(): boolean {
  return isAuthEnabled() && hasDatabase();
}

export function getCustomerRepository(): CustomerRepository {
  return createCustomerRepository(getSql());
}

/**
 * Resolves the signed-in customer from the session cookie and links it to a
 * customers row on first use. Returns null when signed out or unavailable.
 */
export const getCurrentCustomer = cache(async function getCurrentCustomer(): Promise<Customer | null> {
  if (!accountsAvailable()) return null;
  const user = await getSessionUser();
  if (!user) return null;
  return getCustomerRepository().ensureCustomer(user.id, user.email, user.name);
});
