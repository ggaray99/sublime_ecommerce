import type { MetadataRoute } from "next";
import { products } from "@/data/products";
import { site } from "@/data/site";

const staticRoutes = ["", "/tienda", "/categorias", "/encargos", "/nosotros", "/envios", "/preguntas", "/politicas"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticRoutes.map((route) => ({ url: `${site.url}${route}` })),
    ...products.map((product) => ({ url: `${site.url}/producto/${product.slug}` })),
  ];
}
