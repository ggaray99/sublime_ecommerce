import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { isSiteIndexable } from "@/server/env";

/** Private and transactional pages that never belong in search results. */
const privatePaths = ["/admin", "/api/", "/cuenta", "/carrito", "/checkout", "/pedido/", "/encargo/", "/vista-previa", "/mantenimiento"];

// While the store is closed, the proxy answers /robots.txt itself (Disallow: /).
export default function robots(): MetadataRoute.Robots {
  if (!isSiteIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
