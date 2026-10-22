import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { categories } from "../src/data/categories.ts";
import { products, themes } from "../src/data/products.ts";
import { defaultFilters, filterProducts, filtersToSearch, normalize, parseFilters, relatedProducts } from "../src/lib/catalog.ts";

const valid = { categories: categories.map((category) => category.id), themes: Object.keys(themes) };
const publicDir = join(import.meta.dirname, "..", "public");

describe("catalog data", () => {
  it("has between 16 and 24 original demo products plus 50 catalog stickers", () => {
    const original = products.filter((product) => !product.code);
    const fromCatalog = products.filter((product) => product.code);
    assert.ok(original.length >= 16 && original.length <= 24, `found ${original.length}`);
    assert.equal(fromCatalog.length, 50);
    assert.equal(new Set(fromCatalog.map((product) => product.code)).size, 50);
    assert.ok(fromCatalog.every((product) => product.category === "stickers" && product.price !== null));
    assert.ok(products.every((product) => product.isDemo === true));
  });

  it("uses unique ids and slugs", () => {
    assert.equal(new Set(products.map((product) => product.id)).size, products.length);
    assert.equal(new Set(products.map((product) => product.slug)).size, products.length);
  });

  it("covers every category with at least one product", () => {
    for (const category of categories) {
      assert.ok(products.some((product) => product.category === category.id), category.id);
    }
  });

  it("references local images that exist", () => {
    const sources = [...products.flatMap((product) => product.images.map((image) => image.src)), ...categories.map((c) => c.image)];
    for (const src of sources) {
      assert.ok(src.startsWith("/demo/") || src.startsWith("/catalogo/"), src);
      assert.ok(existsSync(join(publicDir, src)), `missing ${src}`);
    }
  });

  it("keeps purchase modes consistent", () => {
    for (const product of products) {
      assert.notEqual(product.availableForDirectPurchase, product.requiresQuote, product.slug);
      if (product.availableForDirectPurchase) assert.ok(typeof product.price === "number" && product.price > 0, product.slug);
      else assert.equal(product.price, null, product.slug);
    }
  });
});

describe("filters", () => {
  it("normalizes accents and case", () => {
    assert.equal(normalize("  Fútbol GRÁFICO "), "futbol grafico");
  });

  it("searches name and tags without accents", () => {
    const result = filterProducts(products, { ...defaultFilters, query: "futbol" });
    assert.ok(result.length > 0);
    assert.ok(result.every((product) => normalize(`${product.name} ${product.tags.join(" ")}`).includes("futbol")));
  });

  it("filters by category, type and theme together", () => {
    const result = filterProducts(products, { ...defaultFilters, category: "packs", type: "estandar", theme: "futbol" });
    assert.deepEqual(
      result.map((product) => product.slug),
      ["pack-tribuna"],
    );
  });

  it("finds catalog stickers by their code", () => {
    assert.deepEqual(
      filterProducts(products, { ...defaultFilters, query: "088" }).map((product) => product.code),
      ["088"],
    );
  });

  it("returns an empty list when nothing matches", () => {
    assert.equal(filterProducts(products, { ...defaultFilters, query: "zzzz-no-existe" }).length, 0);
  });

  it("sorts by price and leaves quoted products last", () => {
    const asc = filterProducts(products, { ...defaultFilters, sort: "precio-asc" });
    const priced = asc.filter((product) => product.price !== null).map((product) => product.price);
    assert.deepEqual(priced, [...priced].sort((a, b) => a - b));
    assert.equal(asc.at(-1).price, null);
    const desc = filterProducts(products, { ...defaultFilters, sort: "precio-desc" });
    assert.equal(desc[0].price, Math.max(...priced));
    assert.equal(desc.at(-1).price, null);
  });

  it("sorts by name in Spanish order", () => {
    const names = filterProducts(products, { ...defaultFilters, sort: "nombre-asc" }).map((product) => product.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("round-trips filters through the URL and ignores invalid values", () => {
    const filters = { query: "anime", category: "stickers", type: "estandar", theme: "anime", sort: "precio-asc" };
    const search = filtersToSearch(filters);
    assert.equal(search, "?q=anime&categoria=stickers&tipo=estandar&tema=anime&orden=precio-asc");
    assert.deepEqual(parseFilters(new URLSearchParams(search), valid), filters);
    assert.deepEqual(parseFilters(new URLSearchParams("?categoria=hackeo&orden=x"), valid), defaultFilters);
    assert.equal(filtersToSearch(defaultFilters), "");
  });

  it("finds related products from the same category first", () => {
    const product = products.find((item) => item.slug === "pack-tribuna");
    const related = relatedProducts(products, product);
    assert.ok(related.length > 0 && related.length <= 4);
    assert.ok(!related.includes(product));
    assert.equal(related[0].category, "packs");
  });
});
