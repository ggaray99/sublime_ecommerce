// Points of sale: validation, Google Maps links and the repository over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mapQuery } from "../src/lib/points.ts";
import { createPointRepository, parseLocation, parsePoint } from "../src/server/points/repository.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

const valid = {
  name: "Kiosco La Esquina",
  kind: "kiosco",
  address: "San Martín 1200",
  city: "Mendoza",
  province: "Mendoza",
  hours: "Lunes a sábado de 9 a 21 h",
  phone: "+54 261 555-1234",
  instagram: "https://www.instagram.com/la.esquina/",
  notes: "Stickers sueltos y packs.",
};

describe("parseLocation", () => {
  it("reads plain coordinates and the usual Google Maps links", () => {
    assert.deepEqual(parseLocation("-32.889459, -68.845839"), { latitude: -32.889459, longitude: -68.845839 });
    assert.deepEqual(parseLocation("https://www.google.com/maps/place/X/@-32.8894587,-68.8458386,17z/data=!3m1"), {
      latitude: -32.889459,
      longitude: -68.845839,
    });
    assert.deepEqual(parseLocation("https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d-32.8901!4d-68.8402"), {
      latitude: -32.8901,
      longitude: -68.8402,
    });
    assert.deepEqual(parseLocation("https://maps.google.com/?q=-34.6037,-58.3816"), { latitude: -34.6037, longitude: -58.3816 });
  });

  it("rejects text without coordinates or out of range", () => {
    assert.equal(parseLocation("https://maps.app.goo.gl/AbCdEf"), null);
    assert.equal(parseLocation("San Martín 1200"), null);
    assert.equal(parseLocation("95, 10"), null);
  });
});

describe("parsePoint", () => {
  it("accepts a complete point and normalizes Instagram", () => {
    const parsed = parsePoint({ ...valid, location: "-32.8894, -68.8458", active: "on" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.instagram, "la.esquina");
    assert.equal(parsed.value.latitude, -32.8894);
    assert.equal(parsed.value.active, true);
  });

  it("explains every invalid field", () => {
    const parsed = parsePoint({ name: "", kind: "bar", address: "x", city: "", province: "Narnia", location: "acá", phone: "llamar", instagram: "no válido!" });
    assert.equal(parsed.ok, false);
    assert.deepEqual(Object.keys(parsed.errors).sort(), ["address", "city", "instagram", "kind", "location", "name", "phone", "province"]);
  });

  it("works without coordinates: the map searches the address", () => {
    const parsed = parsePoint(valid);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.latitude, null);
    assert.equal(mapQuery(parsed.value), "San Martín 1200, Mendoza, Mendoza, Argentina");
    assert.equal(mapQuery({ ...parsed.value, latitude: -32.1, longitude: -68.2 }), "-32.1,-68.2");
  });
});

describe("point repository (PGlite)", () => {
  let db;
  let repo;
  const actor = { authUserId: "admin-1", email: "admin@example.com" };

  before(async () => {
    db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    repo = createPointRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });

  after(() => db.close());

  it("creates, lists, updates, hides and deletes, with an audit trail", async () => {
    const first = parsePoint({ ...valid, location: "-32.8894, -68.8458" }).value;
    const second = parsePoint({ ...valid, name: "Librería Centro", kind: "libreria", city: "Godoy Cruz", active: "off" }).value;
    const id = await repo.create(actor, first);
    const hiddenId = await repo.create(actor, second);

    assert.deepEqual((await repo.list({ activeOnly: true })).map((point) => point.name), ["Kiosco La Esquina"]);
    assert.equal((await repo.list()).length, 2);
    assert.equal((await repo.get(id)).latitude, -32.8894);

    await repo.update(actor, id, { ...first, name: "Kiosco La Esquina (centro)", latitude: null, longitude: null });
    const updated = await repo.get(id);
    assert.equal(updated.name, "Kiosco La Esquina (centro)");
    assert.equal(updated.latitude, null);

    await repo.remove(actor, hiddenId);
    assert.equal(await repo.get(hiddenId), null);
    await assert.rejects(repo.update(actor, hiddenId, first), /no existe/);

    const { rows } = await db.query("SELECT action FROM audit_logs WHERE entity = 'point' ORDER BY id");
    assert.deepEqual(rows.map((row) => row.action), ["point.create", "point.create", "point.update", "point.delete"]);
  });

  it("the database rejects half coordinates and unknown kinds", async () => {
    await assert.rejects(db.query("INSERT INTO points_of_sale (name, address, city, province, latitude) VALUES ('X', 'Calle 1', 'C', 'P', 1)"));
    await assert.rejects(db.query("INSERT INTO points_of_sale (name, kind, address, city, province) VALUES ('X', 'bar', 'Calle 1', 'C', 'P')"));
  });
});
