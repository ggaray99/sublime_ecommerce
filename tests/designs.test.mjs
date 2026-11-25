// Design catalog on PostgreSQL (PGlite) with the full schema and seeds.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCategoryRepository } from "../src/server/admin/categories-repository.ts";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createDesignRepository, listStorefrontDesigns } from "../src/server/designs/repository.ts";
import { createPostgresDesignOffers } from "../src/server/designs/offers.ts";
import { parseDesignInput } from "../src/server/designs/validation.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const image = { imageUrl: "/media/disenos/gato-0123456789abcdef01234567.webp", sourcePath: "disenos/gato-0123456789abcdef01234567.png", width: 3000, height: 3000, opaque: false };
const input = (overrides = {}) => ({ name: "Gato astronauta", slug: "gato-astronauta", description: "", categoryId: null, kinds: ["tshirt", "mug"], colors: {}, ...overrides });
const KIND_COLORS = {
  tshirt: [
    { key: "blanco", label: "Blanco" },
    { key: "negro", label: "Negro" },
  ],
  tank: [{ key: "blanco", label: "Blanco" }],
};

describe("design validation", () => {
  it("derives the slug from the name and keeps the chosen base products", () => {
    const result = parseDesignInput({ name: "Gato Astronauta!", description: " Espacial ", categoryId: "", kinds: ["tshirt", "mug"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
      name: "Gato Astronauta!",
      slug: "gato-astronauta",
      description: "Espacial",
      categoryId: null,
      kinds: ["tshirt", "mug"],
      colors: {},
      themeIds: [],
    });
  });

  it("keeps the checked colors of each checked kind, in the base product's order", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["tshirt", "tank", "mug"], "colors-tshirt": ["negro", "blanco"], "colors-tank": "blanco" }, KIND_COLORS);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.colors, { tshirt: ["blanco", "negro"], tank: ["blanco"] });
  });

  it("ignores the colors of an unchecked kind", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["mug"], "colors-tshirt": ["negro"] }, KIND_COLORS);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.colors, {});
  });

  it("needs at least one color on a checked kind that comes in colors", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["tshirt", "tank"], "colors-tank": "blanco" }, KIND_COLORS);
    assert.equal(result.ok, false);
    assert.equal(result.errors.colors, "Elegí al menos un color de remera clásica.");
    const tank = parseDesignInput({ name: "Ola", kinds: ["tank"] }, KIND_COLORS);
    assert.equal(tank.errors.colors, "Elegí al menos un color de musculosa.");
  });

  it("rejects a color the base product does not have", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["tshirt"], "colors-tshirt": ["negro", "violeta"] }, KIND_COLORS);
    assert.equal(result.ok, false);
    assert.equal(result.errors.colors, "Elegí colores de la lista: «violeta» no es un color de remera clásica.");
  });

  it("a design on kinds without colors (mug, sticker) saves as before", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["mug", "sticker"] }, KIND_COLORS);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.kinds, ["mug", "sticker"]);
    assert.deepEqual(result.value.colors, {});
  });

  it("accepts a single checkbox value from a form", () => {
    const result = parseDesignInput({ name: "Ola", kinds: "sticker" });
    assert.deepEqual(result.ok && result.value.kinds, ["sticker"]);
  });

  it("rejects a missing name, an unknown base product and a malformed slug", () => {
    const result = parseDesignInput({ name: "", slug: "Mal Slug", kinds: ["tshirt", "gorra"] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.name);
    assert.ok(result.errors.slug);
    assert.ok(result.errors.kinds);
  });
});

describe("design repository", () => {
  let db;
  let designs;
  let categories;
  let products;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    designs = createDesignRepository(sql);
    categories = createCategoryRepository(sql);
    designs.sql = sql;
    products = (await db.query(
      `SELECT p.id, p.legacy_id FROM products p
       WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ORDER BY p.legacy_id LIMIT 2`,
    )).rows;
  });

  after(async () => {
    await db.close();
  });

  it("creates drafts with their base products and logs the change", async () => {
    const id = await designs.createDesign(admin, input());
    const design = await designs.getDesign(id);
    assert.equal(design.status, "draft");
    assert.deepEqual(design.kinds, ["tshirt", "mug"]);
    const { rows } = await db.query(`SELECT action FROM audit_logs WHERE entity = 'design' AND entity_id = $1`, [id]);
    assert.deepEqual(rows.map((row) => row.action), ["design.create"]);
  });

  it("rejects a duplicated slug as a conflict", async () => {
    await assert.rejects(() => designs.createDesign(admin, input()), (error) => error instanceof AdminDataError && error.code === "conflict");
  });

  it("publishes only with an image and at least one base product", async () => {
    const id = await designs.createDesign(admin, input({ slug: "sin-imagen", kinds: [] }));
    await assert.rejects(() => designs.setDesignStatus(admin, id, "published"), /imagen/);
    await designs.setDesignImage(admin, id, image);
    await assert.rejects(() => designs.setDesignStatus(admin, id, "published"), /producto/);
    await designs.updateDesign(admin, id, input({ slug: "sin-imagen", kinds: ["sticker"] }));
    await designs.setDesignStatus(admin, id, "published");
    assert.equal((await designs.getDesign(id)).status, "published");
  });

  it("returns the previous files when the image is replaced", async () => {
    const id = await designs.createDesign(admin, input({ slug: "reemplazo" }));
    assert.deepEqual(await designs.setDesignImage(admin, id, image), { imageUrl: "", sourcePath: "" });
    const next = { ...image, imageUrl: "/media/disenos/otro.webp", sourcePath: "disenos/otro.png" };
    assert.deepEqual(await designs.setDesignImage(admin, id, next), { imageUrl: image.imageUrl, sourcePath: image.sourcePath });
  });

  it("links one product per mockup kind", async () => {
    await designs.setMockupBase(admin, "tshirt", products[0].legacy_id);
    await designs.setMockupBase(admin, "mug", products[1].legacy_id);
    const bases = await designs.listMockupBases();
    assert.equal(bases.tshirt.productId, products[0].id);
    assert.equal(bases.mug.productId, products[1].id);
    assert.equal(bases.tank, undefined);
    await assert.rejects(() => designs.setMockupBase(admin, "tank", products[0].legacy_id), (error) => error.code === "conflict");
    await assert.rejects(() => designs.setMockupBase(admin, "tank", "no-existe"), (error) => error.code === "not_found");
    assert.equal((await designs.listMockupBases()).tank, undefined);
    await designs.setMockupBase(admin, "mug", null);
    assert.equal((await designs.listMockupBases()).mug, undefined);
    await designs.setMockupBase(admin, "mug", products[1].legacy_id);
  });

  it("lists the garment colors of each kind's base product from its active variants", async () => {
    await designs.setMockupBase(admin, "tshirt", products[0].legacy_id);
    const variant = (sku, options, active = true, order = 0) =>
      db.query(`INSERT INTO product_variants (product_id, sku, options, price_minor, active, sort_order) VALUES ($1, $2, $3, 1000, $4, $5)`, [
        products[0].id,
        sku,
        options,
        active,
        order,
      ]);
    await variant("COLOR-T-1", { Color: "Negro", Talle: "M" }, true, 100);
    await variant("COLOR-T-2", { color: "Crema Clara", Talle: "M" }, true, 101);
    await variant("COLOR-T-3", { Color: "negro", Talle: "L" }, true, 102);
    await variant("COLOR-T-4", { Color: "Rojo", Talle: "M" }, false, 103);
    const colors = (await designs.listKindColors()).tshirt ?? [];
    const ours = colors.filter((color) => ["negro", "crema-clara", "rojo"].includes(color.key));
    assert.deepEqual(ours, [
      { key: "negro", label: "Negro" },
      { key: "crema-clara", label: "Crema Clara" },
    ]);
    await db.query(`DELETE FROM product_variants WHERE sku LIKE 'COLOR-T-%'`);
  });

  it("keeps a design's colors per kind and drops them with the kind", async () => {
    const id = await designs.createDesign(admin, input({ slug: "con-colores", kinds: ["tshirt"] }));
    await db.query(`INSERT INTO design_colors (design_id, kind, color) VALUES ($1, 'tshirt', 'negro')`, [id]);
    await assert.rejects(() => db.query(`INSERT INTO design_colors (design_id, kind, color) VALUES ($1, 'tshirt', 'Negro')`, [id]));
    await assert.rejects(() => db.query(`INSERT INTO design_colors (design_id, kind, color) VALUES ($1, 'mug', 'negro')`, [id]));
    await db.query(`DELETE FROM design_bases WHERE design_id = $1 AND kind = 'tshirt'`, [id]);
    assert.equal((await db.query(`SELECT 1 FROM design_colors WHERE design_id = $1`, [id])).rows.length, 0);
  });

  it("accepts a template per garment color, keyed like the colors", async () => {
    const row = (tone) =>
      db.query(
        `INSERT INTO mockup_templates (kind, tone, side, image_url, area_left, area_top, area_width, area_height) VALUES ('tshirt', $1, 'front', '/media/soportes/x.png', 0, 0, 100, 100)`,
        [tone],
      );
    await row("verde-agua");
    await row("dark");
    await assert.rejects(() => row("Verde Agua"));
    await db.query(`DELETE FROM mockup_templates`);
  });

  it("shows the store only published designs, on kinds with an active base product", async () => {
    const id = await designs.createDesign(admin, input({ slug: "publicado", kinds: ["tshirt", "tank"] }));
    await designs.setDesignImage(admin, id, image);
    await designs.setDesignStatus(admin, id, "published");
    const list = await listStorefrontDesigns(designs.sql);
    const found = list.find((design) => design.slug === "publicado");
    assert.deepEqual(found.bases, [{ kind: "tshirt", productId: products[0].legacy_id, colors: null }]);
    assert.equal(list.some((design) => design.slug === "gato-astronauta"), false, "drafts stay hidden");
    // "sin-imagen" is published but only offered as a sticker, which has no base product.
    assert.equal(list.some((design) => design.slug === "sin-imagen"), false);
  });

  it("hides a design when its base product is not active", async () => {
    await db.query(`UPDATE products SET status = 'draft' WHERE id = $1`, [products[0].id]);
    const list = await listStorefrontDesigns(designs.sql);
    assert.equal(list.some((design) => design.slug === "publicado"), false);
    await db.query(`UPDATE products SET status = 'active' WHERE id = $1`, [products[0].id]);
  });

  it("keeps a category with designs from being deleted", async () => {
    await db.query(`INSERT INTO categories (id, label) VALUES ('solo-disenos', 'Solo diseños')`);
    await designs.createDesign(admin, input({ slug: "con-categoria", categoryId: "solo-disenos" }));
    await assert.rejects(() => categories.deleteCategory(admin, "solo-disenos"), (error) => error.code === "conflict");
  });

  it("still deletes an empty category", async () => {
    await db.query(`INSERT INTO categories (id, label) VALUES ('vacia', 'Vacía')`);
    await categories.deleteCategory(admin, "vacia");
    assert.equal((await db.query(`SELECT 1 FROM categories WHERE id = 'vacia'`)).rows.length, 0);
  });

  it("deletes a design without orders", async () => {
    const id = await designs.createDesign(admin, input({ slug: "borrar" }));
    await designs.deleteDesign(admin, id);
    await assert.rejects(() => designs.getDesign(id), (error) => error.code === "not_found");
  });
});

describe("design colors", () => {
  let db;
  let designs;
  let offers;
  let sql;
  let shirt;

  const colorRows = async (id) =>
    (await db.query(`SELECT kind, color FROM design_colors WHERE design_id = $1 ORDER BY kind, color`, [id])).rows.map((row) => `${row.kind}:${row.color}`);
  const publish = async (id) => {
    await designs.setDesignImage(admin, id, image);
    await designs.setDesignStatus(admin, id, "published");
  };

  before(async () => {
    db = new PGlite();
    for (const file of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(file);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    designs = createDesignRepository(sql);
    offers = createPostgresDesignOffers(sql);
    // A T-shirt base whose only active variants come in white and black.
    shirt = (await db.query(
      `SELECT p.id, p.legacy_id FROM products p
       WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ORDER BY p.legacy_id LIMIT 1`,
    )).rows[0];
    await db.query(`UPDATE product_variants SET active = false WHERE product_id = $1`, [shirt.id]);
    for (const [sku, color] of [["COLOR-BLANCO-M", "Blanco"], ["COLOR-NEGRO-M", "Negro"]]) {
      await db.query(`INSERT INTO product_variants (product_id, sku, options, price_minor) VALUES ($1, $2, $3, 1000)`, [shirt.id, sku, { Color: color, Talle: "M" }]);
    }
    await designs.setMockupBase(admin, "tshirt", shirt.legacy_id);
  });

  after(async () => {
    await db.close();
  });

  it("stores the colors per kind on create, diffs them on update and drops them with the kind", async () => {
    const id = await designs.createDesign(admin, input({ slug: "colores", kinds: ["tshirt", "mug"], colors: { tshirt: ["negro"] } }));
    assert.deepEqual((await designs.getDesign(id)).colors, { tshirt: ["negro"] });
    assert.deepEqual(await colorRows(id), ["tshirt:negro"]);

    await designs.updateDesign(admin, id, input({ slug: "colores", kinds: ["tshirt", "mug"], colors: { tshirt: ["blanco"] } }));
    assert.deepEqual((await designs.getDesign(id)).colors, { tshirt: ["blanco"] });
    assert.deepEqual(await colorRows(id), ["tshirt:blanco"]);

    await designs.updateDesign(admin, id, input({ slug: "colores", kinds: ["mug"], colors: {} }));
    const design = await designs.getDesign(id);
    assert.deepEqual(design.kinds, ["mug"]);
    assert.deepEqual(design.colors, {});
    assert.deepEqual(await colorRows(id), []);

    const { rows } = await db.query(`SELECT action, changes FROM audit_logs WHERE entity = 'design' AND entity_id = $1 ORDER BY created_at, id`, [id]);
    assert.deepEqual(rows.map((row) => row.action), ["design.create", "design.update", "design.update"]);
    assert.deepEqual(rows[1].changes.before.colors, { tshirt: ["negro"] });
    assert.deepEqual(rows[1].changes.after.colors, { tshirt: ["blanco"] });
  });

  it("reads a design without saved colors as every color, and offers it on any color", async () => {
    const id = await designs.createDesign(admin, input({ slug: "legado", kinds: ["tshirt"] }));
    await publish(id);
    assert.deepEqual((await designs.getDesign(id)).colors, {});
    const offer = (await offers.findOffers([id])).get(id);
    assert.deepEqual(offer.bases.map((base) => [base.kind, base.colors]), [["tshirt", null]]);
    const listed = (await listStorefrontDesigns(sql)).find((design) => design.id === id);
    assert.deepEqual(listed.bases, [{ kind: "tshirt", productId: shirt.legacy_id, colors: null }]);
  });

  it("lists the enabled colors and leaves out a kind with no enabled color the base product sells", async () => {
    const black = await designs.createDesign(admin, input({ slug: "solo-negra", kinds: ["tshirt"], colors: { tshirt: ["negro"] } }));
    await publish(black);
    const listed = (await listStorefrontDesigns(sql)).find((design) => design.id === black);
    assert.deepEqual(listed.bases, [{ kind: "tshirt", productId: shirt.legacy_id, colors: ["negro"] }]);
    const offer = (await offers.findOffers([black])).get(black);
    assert.deepEqual(offer.bases[0].colors, ["negro"]);

    // The black variant stops being sold: the design has no T-shirt left to offer.
    await db.query(`UPDATE product_variants SET active = false WHERE sku = 'COLOR-NEGRO-M'`);
    assert.equal((await listStorefrontDesigns(sql)).some((design) => design.id === black), false);
    assert.equal((await offers.findOffers([black])).has(black), false);
    await db.query(`UPDATE product_variants SET active = true WHERE sku = 'COLOR-NEGRO-M'`);
  });
});

describe("oversize T-shirt kind", () => {
  let db;
  let sql;
  let designs;
  let offers;
  let classic;
  let oversize;

  before(async () => {
    db = new PGlite();
    for (const file of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(file);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    designs = createDesignRepository(sql);
    offers = createPostgresDesignOffers(sql);
    // Two active products become the classic and the oversize T-shirt bases, both in white and black.
    [classic, oversize] = (await db.query(
      `SELECT p.id, p.legacy_id FROM products p
       WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ORDER BY p.legacy_id LIMIT 2`,
    )).rows;
    for (const [product, prefix] of [[classic, "CLASICA"], [oversize, "OVERSIZE"]]) {
      await db.query(`UPDATE product_variants SET active = false WHERE product_id = $1`, [product.id]);
      for (const [sku, color] of [[`${prefix}-BLANCO-M`, "Blanco"], [`${prefix}-NEGRO-M`, "Negro"]]) {
        await db.query(`INSERT INTO product_variants (product_id, sku, options, price_minor) VALUES ($1, $2, $3, 1000)`, [product.id, sku, { Color: color, Talle: "M" }]);
      }
    }
    await designs.setMockupBase(admin, "tshirt", classic.legacy_id);
    await designs.setMockupBase(admin, "oversize", oversize.legacy_id);
  });

  after(async () => {
    await db.close();
  });

  it("links a base product to the oversize kind and reads its colors from the variants", async () => {
    const bases = await designs.listMockupBases();
    assert.equal(bases.oversize.legacyId, oversize.legacy_id);
    assert.equal(bases.tshirt.legacyId, classic.legacy_id);
    const colors = await designs.listKindColors();
    assert.deepEqual(colors.oversize, [
      { key: "blanco", label: "Blanco" },
      { key: "negro", label: "Negro" },
    ]);
  });

  it("offers a design on the classic and the oversize T-shirt, kinds in catalog order", async () => {
    const kindColors = await designs.listKindColors();
    const parsed = parseDesignInput({ name: "Ola", kinds: ["oversize", "tshirt"], "colors-oversize": "negro", "colors-tshirt": "blanco" }, kindColors);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value.kinds, ["tshirt", "oversize"]);
    const id = await designs.createDesign(admin, input({ slug: "ola", kinds: ["oversize", "tshirt"], colors: { oversize: ["negro"], tshirt: ["blanco"] } }));
    await designs.setDesignImage(admin, id, image);
    await designs.setDesignStatus(admin, id, "published");
    const design = await designs.getDesign(id);
    assert.deepEqual(design.kinds, ["tshirt", "oversize"]);
    assert.deepEqual(design.colors, { oversize: ["negro"], tshirt: ["blanco"] });
    const offer = (await offers.findOffers([id])).get(id);
    assert.deepEqual(offer.bases.map((base) => [base.kind, base.colors]), [["tshirt", ["blanco"]], ["oversize", ["negro"]]]);
    const listed = (await listStorefrontDesigns(sql)).find((item) => item.id === id);
    assert.deepEqual(listed.bases, [
      { kind: "tshirt", productId: classic.legacy_id, colors: ["blanco"] },
      { kind: "oversize", productId: oversize.legacy_id, colors: ["negro"] },
    ]);
  });

  it("still refuses a kind the catalog does not have in the database", async () => {
    const [{ id }] = (await db.query(`SELECT id FROM designs WHERE slug = 'ola'`)).rows;
    await assert.rejects(() => db.query(`INSERT INTO design_bases (design_id, kind) VALUES ($1, 'gorra')`, [id]), /design_bases_kind_check/);
    await assert.rejects(
      () => db.query(`INSERT INTO mockup_bases (kind, product_id) SELECT 'gorra', id FROM products WHERE legacy_id = $1`, [classic.legacy_id]),
      /mockup_bases_kind_check/,
    );
  });
});
