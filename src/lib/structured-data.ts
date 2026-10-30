import type { Product } from "../data/products";
import type { InfoPageContent } from "../data/site";

/**
 * schema.org JSON-LD builders. Search engines and AI assistants read these to
 * understand what the store sells, at what price and whether it is available.
 */

type SiteInfo = { name: string; url: string; description: string };
type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";
const absolute = (path: string, baseUrl: string) => new URL(path, baseUrl).toString();
const organizationId = (baseUrl: string) => absolute("/#organization", baseUrl);

export function organizationJsonLd(site: SiteInfo): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": organizationId(site.url),
    name: site.name,
    url: absolute("/", site.url),
    logo: absolute("/brand/sublime-logo.png", site.url),
    description: site.description,
  };
}

export function websiteJsonLd(site: SiteInfo): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: site.name,
    url: absolute("/", site.url),
    inLanguage: "es-AR",
    publisher: { "@id": organizationId(site.url) },
  };
}

/** `null` stock means made to order; unknown stock (static catalog) counts as available. */
const availability = (stock: number | null | undefined) =>
  stock === 0 ? `${CONTEXT}/OutOfStock` : stock === null ? `${CONTEXT}/MadeToOrder` : `${CONTEXT}/InStock`;

function productOffers(product: Product, url: string): JsonLd | undefined {
  const priced = (product.variants ?? []).filter((variant) => variant.price !== null);
  if (priced.length > 0) {
    const prices = priced.map((variant) => variant.price as number);
    const lowPrice = Math.min(...prices);
    const highPrice = Math.max(...prices);
    // In stock when at least one variant can be bought.
    const status = availability(priced.some((variant) => variant.stock !== 0) ? undefined : 0);
    if (lowPrice !== highPrice) {
      return {
        "@type": "AggregateOffer",
        lowPrice,
        highPrice,
        offerCount: priced.length,
        priceCurrency: "ARS",
        availability: status,
        url,
      };
    }
    return { "@type": "Offer", price: lowPrice, priceCurrency: "ARS", availability: status, url };
  }

  if (product.price === null) return undefined;
  return {
    "@type": "Offer",
    price: product.price,
    priceCurrency: "ARS",
    availability: availability(product.stock),
    ...(product.saleEndsAt && { priceValidUntil: product.saleEndsAt.slice(0, 10) }),
    url,
  };
}

export function productJsonLd(product: Product, options: { baseUrl: string; brand: string; category?: string }): JsonLd {
  const url = absolute(`/producto/${product.slug}`, options.baseUrl);
  const offers = productOffers(product, url);
  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: product.name,
    description: product.description,
    url,
    image: product.images.map((image) => absolute(image.src, options.baseUrl)),
    ...(product.code && { sku: product.code }),
    ...(options.category && { category: options.category }),
    brand: { "@type": "Brand", name: options.brand },
    ...(offers && { offers }),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], baseUrl: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path, baseUrl),
    })),
  };
}

/** Pending answers ("A definir") stay out: only confirmed answers are published. */
export function faqJsonLd(content: InfoPageContent): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: content.sections
      .filter((section) => section.status !== "pendiente")
      .map((section) => ({
        "@type": "Question",
        name: section.title,
        acceptedAnswer: { "@type": "Answer", text: section.body },
      })),
  };
}
