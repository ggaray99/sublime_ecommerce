import { products } from "../data/products.ts";
import { createPostgresCatalogRepository } from "./catalog/postgres-repository.ts";
import { createStaticCatalogRepository, type CatalogRepository } from "./catalog/repository.ts";
import { getSql, hasDatabase } from "./db/client.ts";
import { createPostgresInventoryRepository } from "./inventory/postgres-repository.ts";
import { createUntrackedInventoryRepository, type InventoryRepository } from "./inventory/repository.ts";

export type Repositories = { catalog: CatalogRepository; inventory: InventoryRepository; source: "postgres" | "static" };

let staticRepositories: Repositories | null = null;

/**
 * Postgres when a database is connected (staging/previews), otherwise the
 * static catalog with untracked stock — which is what production uses until
 * the database is approved for it.
 */
export function getRepositories(): Repositories {
  if (hasDatabase()) {
    const sql = getSql();
    return {
      catalog: createPostgresCatalogRepository(sql),
      inventory: createPostgresInventoryRepository(sql),
      source: "postgres",
    };
  }
  staticRepositories ??= {
    catalog: createStaticCatalogRepository(products),
    inventory: createUntrackedInventoryRepository(),
    source: "static",
  };
  return staticRepositories;
}
