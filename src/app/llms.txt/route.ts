import { site } from "@/data/site";
import { llmsTxt } from "@/lib/llms-txt";
import { getStorefrontCategories } from "@/server/storefront";
import { INFO_PAGE_SLUGS } from "@/server/settings/pages";
import { getInfoPage } from "@/server/settings/session";

export async function GET() {
  const [categories, pages] = await Promise.all([getStorefrontCategories(), Promise.all(INFO_PAGE_SLUGS.map((slug) => getInfoPage(slug)))]);
  const body = llmsTxt({ site, categories, infoPages: pages });
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
