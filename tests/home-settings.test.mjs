// Home hero settings (/admin/portada): validation, fallbacks and storage over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createHomeRepository, DEFAULT_HERO, parseHomeHero, pickHeroProducts } from "../src/server/home/settings.ts";

const form = {
  kicker: "Stickers / Remeras",
  titleLine1: "PEGALO",
  titleLine2: "EN TODO.",
  lede: "Diseños originales.",
  primaryLabel: "Ver tienda",
  primaryHref: "/tienda",
  secondaryLabel: "Encargos",
  secondaryHref: "/encargos",
  stamp: "HECHO EN MENDOZA",
  product1: "p20",
  product2: "p08",
  product3: "",
};

describe("parseHomeHero", () => {
  it("accepts a complete hero and keeps the chosen products in order", () => {
    const parsed = parseHomeHero(form);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value.productIds, ["p20", "p08"]);
    assert.equal(parsed.value.titleLine2, "EN TODO.");
  });

  it("only allows links inside the store", () => {
    for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "tienda"]) {
      const parsed = parseHomeHero({ ...form, primaryHref: href });
      assert.equal(parsed.ok, false, href);
      assert.ok(parsed.errors.primaryHref);
    }
    assert.equal(parseHomeHero({ ...form, primaryHref: "/tienda?categoria=stickers&orden=precio-asc#grilla" }).ok, true);
  });

  it("rejects repeated products, empty titles and texts that are too long", () => {
    const parsed = parseHomeHero({ ...form, product2: "p20", titleLine1: "", titleLine2: "", lede: "x".repeat(241) });
    assert.equal(parsed.ok, false);
    assert.deepEqual(Object.keys(parsed.errors).sort(), ["lede", "product1", "titleLine1"]);
  });

  it("drops the second button link when the button has no text", () => {
    const parsed = parseHomeHero({ ...form, secondaryLabel: "", secondaryHref: "cualquier cosa" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.secondaryHref, "");
  });
});

describe("pickHeroProducts", () => {
  const products = [
    { id: "p01", slug: "pack-caos-grafico" },
    { id: "p02", slug: "remera-ruido-visual" },
    { id: "p03", slug: "sticker-gato-de-la-suerte-137" },
    { id: "p20", slug: "vinilo-modular" },
  ];

  it("uses the usual products when nothing is chosen", () => {
    assert.deepEqual(pickHeroProducts(DEFAULT_HERO, products).map((p) => p.id), ["p01", "p02", "p03"]);
  });

  it("puts the chosen ones first and fills the rest without repeating", () => {
    const hero = { ...DEFAULT_HERO, productIds: ["p20", "p02"] };
    assert.deepEqual(pickHeroProducts(hero, products).map((p) => p.id), ["p20", "p02", "p01"]);
  });

  it("skips products that are no longer visible", () => {
    const hero = { ...DEFAULT_HERO, productIds: ["gone", "p03"] };
    assert.deepEqual(pickHeroProducts(hero, products).map((p) => p.id), ["p03", "p01", "p02"]);
  });
});

describe("home repository (PGlite)", () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    for (const name of readdirSync(join("db", "migrations")).filter((n) => n.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join("db", "migrations", name), "utf8"));
    }
    repo = createHomeRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });

  after(() => db.close());

  it("returns the defaults until saved, then the saved hero, with an audit entry", async () => {
    assert.deepEqual(await repo.getHero(), DEFAULT_HERO);
    const hero = parseHomeHero(form).value;
    await repo.saveHero({ authUserId: "admin-1", email: "admin@example.com" }, hero);
    await repo.saveHero({ authUserId: "admin-1", email: "admin@example.com" }, { ...hero, stamp: "" });
    const saved = await repo.getHero();
    assert.equal(saved.titleLine1, "PEGALO");
    assert.equal(saved.stamp, "");
    const { rows } = await db.query("SELECT action FROM audit_logs WHERE entity = 'home'");
    assert.equal(rows.length, 2);
  });
});
