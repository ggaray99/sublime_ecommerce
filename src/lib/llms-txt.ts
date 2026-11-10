import type { Category } from "../data/categories";
import type { InfoPageContent } from "../data/site";

type SiteInfo = { name: string; url: string; description: string };

/**
 * /llms.txt (https://llmstxt.org): a Markdown summary of the store and its key
 * pages, so AI assistants can describe and cite it accurately.
 */
export function llmsTxt({ site, categories, infoPages }: { site: SiteInfo; categories: Category[]; infoPages: InfoPageContent[] }): string {
  const link = (label: string, path: string, note?: string) => `- [${label}](${new URL(path, site.url)})${note ? `: ${note}` : ""}`;
  return [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    "Tienda online argentina. Precios en pesos argentinos (ARS). También hace productos personalizados a pedido.",
    "",
    "## Catálogo",
    "",
    link("Tienda", "/tienda", "todos los productos, con búsqueda por nombre y por código de catálogo"),
    ...categories.map((category) => link(category.label, `/categorias/${category.id}`, category.description)),
    "",
    "## Personalizados",
    "",
    link("Encargos", "/encargos", "pedidos a medida con presupuesto"),
    "",
    "## Información",
    "",
    ...infoPages.map((page) => link(page.title, `/${page.slug}`, page.description)),
    link("Dónde comprar", "/puntos", "puntos de venta físicos"),
    "",
  ].join("\n");
}
