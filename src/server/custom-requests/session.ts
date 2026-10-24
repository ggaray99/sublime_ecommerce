import { getSql, hasDatabase } from "../db/client.ts";
import { createCustomRequestRepository, type CustomRequestRepository } from "./repository.ts";

/** Real custom requests exist only where the database does (staging/previews today). */
export const customRequestsAvailable = (): boolean => hasDatabase();

export function getCustomRequestRepository(): CustomRequestRepository {
  return createCustomRequestRepository(getSql());
}
