import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { getStorefrontCategories, getStorefrontDesigns, getStorefrontProducts } from "@/server/storefront";

const staticRoutes = ["", "/tienda", "/disenos", "/categorias", "/encargos", "/puntos", "/nosotros", "/envios", "/preguntas", "/politicas"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, designs] = await Promise.all([getStorefrontProducts(), getStorefrontCategories(), getStorefrontDesigns()]);
  return [
    ...staticRoutes.map((route) => ({ url: `${site.url}${route}` })),
    ...categories.map((category) => ({ url: `${site.url}/categorias/${category.id}` })),
    ...products.map((product) => ({ url: `${site.url}/producto/${product.slug}` })),
    ...designs.map((design) => ({ url: `${site.url}/disenos/${design.slug}` })),
  ];
}
