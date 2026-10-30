import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProductionEnv, isSiteIndexable } from "../src/server/env.ts";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  productJsonLd,
  websiteJsonLd,
} from "../src/lib/structured-data.ts";

const site = { name: "Sublime", url: "https://example.com.ar", description: "Calcos y stickers." };

const baseProduct = {
  id: "p1",
  slug: "sticker-gato",
  name: "Sticker gato",
  description: "Sticker troquelado.",
  category: "stickers",
  theme: "animales",
  price: 1500,
  images: [{ src: "/demo/products/sticker-gato-1.webp", alt: "Sticker de un gato" }],
  tags: [],
  featured: false,
  isDemo: true,
  availableForDirectPurchase: true,
  requiresQuote: false,
  details: [],
};

describe("site indexing switch", () => {
  it("indexes only production with SITE_INDEXABLE=true", () => {
    assert.equal(isSiteIndexable({ SUBLIME_ENV: "production", SITE_INDEXABLE: "true" }), true);
    assert.equal(isSiteIndexable({ SUBLIME_ENV: "production" }), false);
    assert.equal(isSiteIndexable({ SUBLIME_ENV: "production", SITE_INDEXABLE: "1" }), false);
    assert.equal(isSiteIndexable({ SUBLIME_ENV: "staging", SITE_INDEXABLE: "true" }), false);
  });

  it("keeps the production check unchanged", () => {
    assert.equal(isProductionEnv({ SUBLIME_ENV: "production" }), true);
    assert.equal(isProductionEnv({ VERCEL_ENV: "production" }), true);
    assert.equal(isProductionEnv({ SUBLIME_ENV: "staging" }), false);
  });
});

describe("organization and website", () => {
  it("describes the business with an absolute logo", () => {
    const org = organizationJsonLd(site);
    assert.equal(org["@type"], "Organization");
    assert.equal(org["@id"], "https://example.com.ar/#organization");
    assert.equal(org.url, "https://example.com.ar/");
    assert.equal(org.logo, "https://example.com.ar/brand/sublime-logo.png");
    assert.equal(org.description, site.description);
  });

  it("links the website to its publisher in es-AR", () => {
    const web = websiteJsonLd(site);
    assert.equal(web["@type"], "WebSite");
    assert.equal(web.inLanguage, "es-AR");
    assert.deepEqual(web.publisher, { "@id": "https://example.com.ar/#organization" });
  });
});

describe("product", () => {
  it("builds a Product with an ARS offer and absolute URLs", () => {
    const data = productJsonLd({ ...baseProduct, code: "ST-01", stock: 4 }, { baseUrl: site.url, brand: "Sublime", category: "Stickers" });
    assert.equal(data["@context"], "https://schema.org");
    assert.equal(data["@type"], "Product");
    assert.equal(data.url, "https://example.com.ar/producto/sticker-gato");
    assert.deepEqual(data.image, ["https://example.com.ar/demo/products/sticker-gato-1.webp"]);
    assert.equal(data.sku, "ST-01");
    assert.equal(data.category, "Stickers");
    assert.deepEqual(data.brand, { "@type": "Brand", name: "Sublime" });
    assert.deepEqual(data.offers, {
      "@type": "Offer",
      price: 1500,
      priceCurrency: "ARS",
      availability: "https://schema.org/InStock",
      url: "https://example.com.ar/producto/sticker-gato",
    });
  });

  it("maps stock to availability", () => {
    const availability = (stock) => productJsonLd({ ...baseProduct, stock }, { baseUrl: site.url, brand: "Sublime" }).offers.availability;
    assert.equal(availability(0), "https://schema.org/OutOfStock");
    assert.equal(availability(null), "https://schema.org/MadeToOrder");
    assert.equal(availability(undefined), "https://schema.org/InStock");
  });

  it("adds the sale end date", () => {
    const data = productJsonLd({ ...baseProduct, regularPrice: 2000, saleEndsAt: "2026-12-01T03:00:00.000Z" }, { baseUrl: site.url, brand: "Sublime" });
    assert.equal(data.offers.priceValidUntil, "2026-12-01");
  });

  it("omits the offer for quoted products", () => {
    const data = productJsonLd({ ...baseProduct, price: null, requiresQuote: true, availableForDirectPurchase: false }, { baseUrl: site.url, brand: "Sublime" });
    assert.equal(data.offers, undefined);
    assert.equal(data.sku, undefined);
  });

  it("uses an AggregateOffer for variants with different prices", () => {
    const variants = [
      { sku: "R-S", options: { Talle: "S" }, price: 9000, stock: 0 },
      { sku: "R-L", options: { Talle: "L" }, price: 11000, stock: 3 },
      { sku: "R-XL", options: { Talle: "XL" }, price: null, stock: null },
    ];
    const data = productJsonLd({ ...baseProduct, price: 9000, variants, optionNames: ["Talle"] }, { baseUrl: site.url, brand: "Sublime" });
    assert.deepEqual(data.offers, {
      "@type": "AggregateOffer",
      lowPrice: 9000,
      highPrice: 11000,
      offerCount: 2,
      priceCurrency: "ARS",
      availability: "https://schema.org/InStock",
      url: "https://example.com.ar/producto/sticker-gato",
    });
  });

  it("marks variants out of stock when none is available", () => {
    const variants = [
      { sku: "R-S", options: { Talle: "S" }, price: 9000, stock: 0 },
      { sku: "R-L", options: { Talle: "L" }, price: 9000, stock: 0 },
    ];
    const data = productJsonLd({ ...baseProduct, price: 9000, variants }, { baseUrl: site.url, brand: "Sublime" });
    assert.equal(data.offers["@type"], "Offer");
    assert.equal(data.offers.availability, "https://schema.org/OutOfStock");
  });
});

describe("category listing", () => {
  it("lists the category products in order", () => {
    const data = itemListJsonLd([baseProduct, { ...baseProduct, slug: "sticker-perro", name: "Sticker perro" }], site.url);
    assert.equal(data["@type"], "ItemList");
    assert.equal(data.numberOfItems, 2);
    assert.deepEqual(data.itemListElement[1], {
      "@type": "ListItem",
      position: 2,
      name: "Sticker perro",
      url: "https://example.com.ar/producto/sticker-perro",
    });
  });
});

describe("breadcrumbs and FAQ", () => {
  it("numbers breadcrumb items with absolute URLs", () => {
    const data = breadcrumbJsonLd(
      [
        { name: "Tienda", path: "/tienda" },
        { name: "Sticker gato", path: "/producto/sticker-gato" },
      ],
      site.url,
    );
    assert.equal(data["@type"], "BreadcrumbList");
    assert.deepEqual(data.itemListElement[1], {
      "@type": "ListItem",
      position: 2,
      name: "Sticker gato",
      item: "https://example.com.ar/producto/sticker-gato",
    });
  });

  it("publishes only confirmed answers", () => {
    const data = faqJsonLd({
      slug: "preguntas",
      title: "Preguntas frecuentes",
      description: "",
      intro: "",
      sections: [
        { title: "¿Cómo compro?", body: "Sumá productos al carrito." },
        { title: "¿Medios de pago?", body: "A definir.", status: "pendiente" },
      ],
    });
    assert.equal(data["@type"], "FAQPage");
    assert.deepEqual(data.mainEntity, [
      { "@type": "Question", name: "¿Cómo compro?", acceptedAnswer: { "@type": "Answer", text: "Sumá productos al carrito." } },
    ]);
  });
});
