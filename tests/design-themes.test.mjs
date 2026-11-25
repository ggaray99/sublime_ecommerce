// Design themes (temáticas): list, create or reuse, link to designs, show in the store.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createDesignRepository, listStorefrontDesigns } from "../src/server/designs/repository.ts";
import { parseThemeLabel } from "../src/server/designs/themes.ts";
import { parseDesignInput } from "../src/server/designs/validation.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const image = { imageUrl: "/media/disenos/gato-0123456789abcdef01234567.webp", sourcePath: "disenos/gato-0123456789abcdef01234567.png", width: 3000, height: 3000, opaque: false };
const input = (overrides = {}) => ({ name: "Gato astronauta", slug: "gato-astronauta", description: "", categoryId: null, kinds: ["tshirt"], colors: {}, themeIds: [], ...overrides });
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("theme labels", () => {
  it("trims the label, collapses spaces and derives the slug like the designs do", () => {
    assert.deepEqual(parseThemeLabel("  Fútbol   y  Deportes "), { ok: true, label: "Fútbol y Deportes", slug: "futbol-y-deportes" });
  });

  it("rejects an empty label, a long one and one without letters or numbers", () => {
    assert.deepEqual(parseThemeLabel("   "), { ok: false, error: "Escribí el nombre de la temática." });
    assert.deepEqual(parseThemeLabel("a".repeat(61)), { ok: false, error: "La temática puede tener hasta 60 caracteres." });
    assert.deepEqual(parseThemeLabel("¡¡!!"), { ok: false, error: "La temática necesita al menos una letra o un número." });
  });
});

describe("design input themes", () => {
  const known = [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "22222222-2222-4222-8222-222222222222" }];

  it("keeps the checked themes in list order, without duplicates", () => {
    const result = parseDesignInput({ name: "Ola", kinds: ["mug"], themes: [known[1].id, known[0].id, known[1].id] }, {}, known);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.themeIds, [known[0].id, known[1].id]);
  });

  it("accepts a single checkbox value and the JSON key themeIds", () => {
    assert.deepEqual(parseDesignInput({ name: "Ola", themes: known[0].id }, {}, known).value.themeIds, [known[0].id]);
    assert.deepEqual(parseDesignInput({ name: "Ola", themeIds: [known[1].id] }, {}, known).value.themeIds, [known[1].id]);
  });

  it("rejects a theme that is not in the list", () => {
    const result = parseDesignInput({ name: "Ola", themes: [known[0].id, MISSING] }, {}, known);
    assert.equal(result.ok, false);
    assert.equal(result.errors.themeIds, "Elegí temáticas de la lista.");
    const malformed = parseDesignInput({ name: "Ola", themes: ["rock"] });
    assert.equal(malformed.errors.themeIds, "Elegí temáticas de la lista.");
  });

  it("a design without themes parses exactly as before, with an empty theme list", () => {
    const result = parseDesignInput({ name: "Gato Astronauta!", description: " Espacial ", categoryId: "", kinds: ["tshirt", "mug"] });
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
});

describe("theme repository", () => {
  let db;
  let sql;
  let designs;
  let shirt;

  const themeAudit = async () =>
    (await db.query(`SELECT action, entity, entity_id, changes, actor_email FROM audit_logs WHERE action = 'design.theme_create' ORDER BY created_at, id`)).rows;
  const linkRows = async (id) =>
    (await db.query(`SELECT t.slug FROM design_theme_links l JOIN design_themes t ON t.id = l.theme_id WHERE l.design_id = $1 ORDER BY t.slug`, [id])).rows.map((row) => row.slug);

  before(async () => {
    db = new PGlite();
    for (const file of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(file);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    designs = createDesignRepository(sql);
    shirt = (await db.query(
      `SELECT p.id, p.legacy_id FROM products p
       WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ORDER BY p.legacy_id LIMIT 1`,
    )).rows[0];
    await designs.setMockupBase(admin, "tshirt", shirt.legacy_id);
  });

  after(async () => {
    await db.close();
  });

  it("starts with no themes", async () => {
    assert.deepEqual(await designs.listThemes(), []);
  });

  it("creates a theme from its label and logs it", async () => {
    const theme = await designs.createTheme(admin, "  Fútbol ");
    assert.match(theme.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ slug: theme.slug, label: theme.label }, { slug: "futbol", label: "Fútbol" });
    assert.deepEqual(await designs.listThemes(), [theme]);
    const audit = await themeAudit();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "design.theme_create");
    assert.equal(audit[0].entity, "design");
    assert.equal(audit[0].entity_id, theme.id);
    assert.equal(audit[0].actor_email, admin.email);
    assert.deepEqual(audit[0].changes, { label: "Fútbol", slug: "futbol" });
  });

  it("reuses the existing theme when the label only differs in case or accents", async () => {
    const [existing] = await designs.listThemes();
    const again = await designs.createTheme(admin, "FUTBOL");
    assert.deepEqual(again, existing);
    assert.equal((await designs.listThemes()).length, 1);
    assert.equal((await themeAudit()).length, 1, "reusing logs nothing");
  });

  it("lists themes alphabetically", async () => {
    await designs.createTheme(admin, "Animales");
    await designs.createTheme(admin, "Rock");
    assert.deepEqual((await designs.listThemes()).map((theme) => theme.label), ["Animales", "Fútbol", "Rock"]);
  });

  it("refuses an invalid label with its message", async () => {
    await assert.rejects(
      () => designs.createTheme(admin, "  "),
      (error) => error instanceof AdminDataError && error.message === "Escribí el nombre de la temática.",
    );
  });

  it("links the themes on create, diffs them on update and logs both", async () => {
    const [animales, futbol, rock] = await designs.listThemes();
    const id = await designs.createDesign(admin, input({ slug: "con-tematicas", themeIds: [futbol.id, animales.id] }));
    const created = await designs.getDesign(id);
    assert.deepEqual(created.themeIds, [animales.id, futbol.id]);
    assert.deepEqual(created.themes, [animales, futbol]);
    assert.deepEqual(await linkRows(id), ["animales", "futbol"]);

    await designs.updateDesign(admin, id, input({ slug: "con-tematicas", themeIds: [rock.id, futbol.id] }));
    const updated = await designs.getDesign(id);
    assert.deepEqual(updated.themeIds, [futbol.id, rock.id]);
    assert.deepEqual(await linkRows(id), ["futbol", "rock"]);

    await designs.updateDesign(admin, id, input({ slug: "con-tematicas", themeIds: [] }));
    assert.deepEqual((await designs.getDesign(id)).themeIds, []);
    assert.deepEqual(await linkRows(id), []);

    const { rows } = await db.query(`SELECT action, changes FROM audit_logs WHERE entity = 'design' AND entity_id = $1 ORDER BY created_at, id`, [id]);
    assert.deepEqual(rows.map((row) => row.action), ["design.create", "design.update", "design.update"]);
    assert.deepEqual(rows[0].changes.themeIds, [futbol.id, animales.id]);
    assert.deepEqual(rows[1].changes.before.themeIds, [animales.id, futbol.id]);
    assert.deepEqual(rows[1].changes.after.themeIds, [rock.id, futbol.id]);
  });

  it("rejects an unknown theme on create and on update, saving nothing", async () => {
    const designsBefore = Number((await db.query(`SELECT count(*)::int AS n FROM designs`)).rows[0].n);
    await assert.rejects(
      () => designs.createDesign(admin, input({ slug: "tematica-fantasma", themeIds: [MISSING] })),
      (error) => error instanceof AdminDataError && error.code === "not_found" && error.message === "La temática no existe.",
    );
    await assert.rejects(
      () => designs.createDesign(admin, input({ slug: "tematica-rota", themeIds: ["rock"] })),
      (error) => error instanceof AdminDataError && error.message === "La temática no existe.",
    );
    assert.equal(Number((await db.query(`SELECT count(*)::int AS n FROM designs`)).rows[0].n), designsBefore);

    const [animales] = await designs.listThemes();
    const id = await designs.createDesign(admin, input({ slug: "tematica-update", themeIds: [animales.id] }));
    await assert.rejects(
      () => designs.updateDesign(admin, id, input({ slug: "tematica-update", name: "Otro nombre", themeIds: [MISSING] })),
      (error) => error instanceof AdminDataError && error.message === "La temática no existe.",
    );
    const kept = await designs.getDesign(id);
    assert.equal(kept.name, "Gato astronauta");
    assert.deepEqual(kept.themeIds, [animales.id]);
  });

  it("a design saved without themes behaves exactly as before", async () => {
    // Callers from before themes do not send themeIds at all.
    const legacy = input({ slug: "sin-tematicas", kinds: ["tshirt", "mug"], colors: { tshirt: ["negro"] } });
    delete legacy.themeIds;
    const id = await designs.createDesign(admin, legacy);
    const design = await designs.getDesign(id);
    assert.deepEqual(
      { name: design.name, slug: design.slug, description: design.description, categoryId: design.categoryId, kinds: design.kinds, colors: design.colors, status: design.status },
      { name: "Gato astronauta", slug: "sin-tematicas", description: "", categoryId: null, kinds: ["tshirt", "mug"], colors: { tshirt: ["negro"] }, status: "draft" },
    );
    assert.deepEqual(design.themeIds, []);
    assert.deepEqual(design.themes, []);
    await designs.updateDesign(admin, id, { ...legacy, name: "Gato renombrado" });
    const updated = await designs.getDesign(id);
    assert.equal(updated.name, "Gato renombrado");
    assert.deepEqual(updated.kinds, ["tshirt", "mug"]);
    assert.deepEqual(updated.colors, { tshirt: ["negro"] });
  });

  it("gives the store each design's themes, and an empty list without themes", async () => {
    const [animales, futbol] = await designs.listThemes();
    const themed = await designs.createDesign(admin, input({ slug: "tienda-tematica", themeIds: [futbol.id, animales.id] }));
    const plain = await designs.createDesign(admin, input({ slug: "tienda-sin-tematica" }));
    for (const id of [themed, plain]) {
      await designs.setDesignImage(admin, id, image);
      await designs.setDesignStatus(admin, id, "published");
    }
    const list = await listStorefrontDesigns(sql);
    assert.deepEqual(list.find((design) => design.id === themed).themes, [
      { slug: "animales", label: "Animales" },
      { slug: "futbol", label: "Fútbol" },
    ]);
    assert.deepEqual(list.find((design) => design.id === plain).themes, []);
  });

  it("drops the links when a design is deleted", async () => {
    const [animales] = await designs.listThemes();
    const id = await designs.createDesign(admin, input({ slug: "borrar-tematica", themeIds: [animales.id] }));
    await designs.deleteDesign(admin, id);
    assert.deepEqual(await linkRows(id), []);
    assert.equal((await designs.listThemes()).length, 3, "the theme stays");
  });
});
