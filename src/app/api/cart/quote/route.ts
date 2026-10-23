import { products } from "@/data/products";
import { createStaticCatalogRepository } from "@/server/catalog/repository";
import { handleCartQuote } from "@/server/cart/handler";
import { createUntrackedInventoryRepository } from "@/server/inventory/repository";

// Static catalog and untracked inventory until the database is provisioned (Fase 1).
const deps = {
  catalog: createStaticCatalogRepository(products),
  inventory: createUntrackedInventoryRepository(),
};

/** POST /api/cart/quote — recomputes prices, availability and totals on the server. */
export async function POST(request: Request) {
  return handleCartQuote(request, deps);
}
