import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { products } from "../src/data/products.ts";
import { toCatalogVariant } from "../src/server/catalog/repository.ts";
import { applyCommercialData, isOutOfStock } from "../src/server/catalog/storefront.ts";

const sticker = products.find((product) => product.code && product.availableForDirectPurchase);
const custom = products.find((product) => product.requiresQuote);
const other = products.find((product) => product !== sticker && !product.requiresQuote && product.availableForDirectPurchase);

const variants = (...overrides) =>
  new Map(overrides.map(([product, patch]) => [product.id, { ...toCatalogVariant(product), ...patch }]));

describe("storefront overlay of database data on the static catalog", () => {
  it("takes price and stock from the database and keeps content from the static catalog", () => {
    const active = variants([sticker, { unitPriceMinor: 199950 }]);
    const [result] = applyCommercialData([sticker], active, new Map([[toCatalogVariant(sticker).sku, 7]]));
    assert.equal(result.price, 1999.5);
    assert.equal(result.stock, 7);
    assert.deepEqual(result.images, sticker.images);
    assert.equal(result.name, sticker.name);
  });

  it("hides products that are not active in the database", () => {
    const active = variants([sticker, {}], [other, { active: false }]);
    const result = applyCommercialData([sticker, other, custom], active, new Map());
    assert.deepEqual(
      result.map((product) => product.id),
      [sticker.id],
      "inactive and missing products are hidden",
    );
  });

  it("treats tracked products without inventory as out of stock and custom ones as made to order", () => {
    const result = applyCommercialData([sticker, custom], variants([sticker, {}], [custom, {}]), new Map());
    assert.equal(result[0].stock, 0);
    assert.equal(isOutOfStock(result[0]), true);
    assert.equal(result[1].stock, null);
    assert.equal(isOutOfStock(result[1]), false);
  });

  it("never sells a product the database marks as not purchasable", () => {
    const [result] = applyCommercialData([sticker], variants([sticker, { purchasable: false }]), new Map());
    assert.equal(result.availableForDirectPurchase, false);
  });

  it("leaves the static catalog untouched", () => {
    assert.equal(sticker.stock, undefined);
    assert.equal(isOutOfStock(sticker), false);
  });
});
