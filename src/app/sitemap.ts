import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { getStorefrontProducts } from "@/server/storefront";

const staticRoutes = ["", "/tienda", "/categorias", "/encargos", "/nosotros", "/envios", "/preguntas", "/politicas"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getStorefrontProducts();
  return [
    ...staticRoutes.map((route) => ({ url: `${site.url}${route}` })),
    ...products.map((product) => ({ url: `${site.url}/producto/${product.slug}` })),
  ];
}
