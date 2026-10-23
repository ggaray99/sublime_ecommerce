import { handleCartQuote } from "@/server/cart/handler";
import { getRepositories } from "@/server/repositories";

/**
 * POST /api/cart/quote — recomputes prices, availability and totals on the server.
 * Uses Postgres when DATABASE_URL is configured, the static catalog otherwise.
 */
export async function POST(request: Request) {
  return handleCartQuote(request, getRepositories());
}
