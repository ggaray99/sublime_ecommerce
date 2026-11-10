import { handleCartQuote } from "@/server/cart/handler";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { getRepositories } from "@/server/repositories";

/**
 * POST /api/cart/quote — recomputes prices, availability and totals on the server.
 * Uses Postgres when DATABASE_URL is configured, the static catalog otherwise.
 */
export async function POST(request: Request) {
  // Expired holds are released before reading availability (no scheduled job needed).
  if (ordersAvailable()) await getOrderRepository().releaseExpired();
  return handleCartQuote(request, getRepositories());
}
