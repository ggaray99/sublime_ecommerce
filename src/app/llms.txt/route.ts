import { infoPages, site } from "@/data/site";
import { llmsTxt } from "@/lib/llms-txt";
import { getStorefrontCategories } from "@/server/storefront";

export async function GET() {
  const body = llmsTxt({ site, categories: await getStorefrontCategories(), infoPages: Object.values(infoPages) });
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
