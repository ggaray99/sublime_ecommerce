// Uploaded mockup templates (Admin › Soportes): storage, store overrides and print-area rules.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  fitTemplateArea,
  isTemplateSlot,
  MIN_AREA_PX,
  mockupTemplate,
  MOCKUPS,
  startingArea,
  TEMPLATE_PX,
  TEMPLATE_SLOTS,
} from "../src/lib/designs/mockups.ts";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createMockupTemplateRepository, listTemplateOverrides, templateFiles } from "../src/server/mockups/templates-repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const shirtSlot = { kind: "tshirt", tone: "dark", side: "back" };
const mugSlot = { kind: "mug", tone: "light", side: "front" };
const file = (name) => `/media/soportes/${name}-0123456789abcdef01234567.png`;
const shirtInput = (overrides = {}) => ({
  imageUrl: file("remera"),
  area: { left: 400, top: 300, width: 280, height: 350 },
  warp: { map: file("remera-map"), shade: file("remera-shade"), scale: 10 },
  curve: null,
  ...overrides,
});

describe("template slots and print areas", () => {
  it("lists one slot per tone and side each kind declares", () => {
    // tshirt, oversize and tank: 2 tones × 2 sides; mug and sticker: 1.
    assert.equal(TEMPLATE_SLOTS.length, 14);
    assert.ok(isTemplateSlot("tank", "dark", "back"));
    assert.ok(isTemplateSlot("mug", "light", "front"));
    assert.equal(isTemplateSlot("mug", "dark", "front"), false);
    assert.equal(isTemplateSlot("gorra", "light", "front"), false);
  });

  it("keeps a marked area inside the template, with the kind's print proportion", () => {
    const area = fitTemplateArea("tank", { left: 900, top: -20, width: 300 });
    assert.deepEqual(area, { left: TEMPLATE_PX - 300, top: 0, width: 300, height: 375 });
    assert.equal(fitTemplateArea("sticker", { left: 0, top: 0, width: 5 }).width, MIN_AREA_PX);
    const huge = fitTemplateArea("tshirt", { left: 0, top: 0, width: 5000 });
    assert.ok(huge.top + huge.height <= TEMPLATE_PX && huge.left + huge.width <= TEMPLATE_PX);
    const { printCm } = MOCKUPS.tshirt;
    assert.ok(Math.abs(huge.height / huge.width - printCm.height / printCm.width) < 0.01);
    assert.deepEqual(fitTemplateArea("mug", { left: Number.NaN, top: 10, width: Number.NaN }).left, 0);
  });

  it("starts a new photo with a print area of the right proportion", () => {
    for (const slot of TEMPLATE_SLOTS) {
      const area = startingArea(slot);
      const { printCm } = MOCKUPS[slot.kind];
      assert.ok(Math.abs(area.height / area.width - printCm.height / printCm.width) < 0.01, `${slot.kind}: wrong proportion`);
    }
  });

  it("uses an uploaded template instead of the built-in one, only for its slot", () => {
    const override = { src: file("remera"), area: { left: 1, top: 2, width: 300, height: 375 } };
    const overrides = { "tshirt-dark-back": override };
    const used = mockupTemplate("tshirt", "dark", "back", overrides);
    assert.equal(used.src, override.src);
    assert.equal(used.warp, undefined);
    assert.equal(used.blend, "normal");
    assert.notEqual(mockupTemplate("tshirt", "dark", "front", overrides).src, override.src);
    assert.equal(mockupTemplate("tshirt", "light", "back", overrides).blend, "multiply");
  });
});

describe("mockup template repository", () => {
  let db;
  let repo;
  let sql;

  before(async () => {
    db = new PGlite();
    for (const text of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createMockupTemplateRepository(sql);
  });

  after(async () => {
    await db.close();
  });

  it("saves an uploaded template, logs it and serves it to the store by slot", async () => {
    assert.equal(await repo.saveTemplate(admin, shirtSlot, shirtInput()), null);
    const saved = await repo.getTemplate(shirtSlot);
    assert.deepEqual({ ...saved, updatedAt: undefined }, { ...shirtSlot, ...shirtInput(), updatedAt: undefined });
    assert.deepEqual(await listTemplateOverrides(sql), {
      "tshirt-dark-back": { src: file("remera"), area: shirtInput().area, warp: shirtInput().warp },
    });
    const [log] = await sql.query(`SELECT action, entity, entity_id FROM audit_logs WHERE action = 'design.template'`);
    assert.deepEqual(log, { action: "design.template", entity: "design", entity_id: "tshirt-dark-back" });
  });

  it("replaces the slot's template and hands back the previous one", async () => {
    const previous = await repo.saveTemplate(admin, shirtSlot, shirtInput({ imageUrl: file("remera-nueva") }));
    assert.equal(previous.imageUrl, file("remera"));
    assert.deepEqual(templateFiles(previous), [file("remera"), file("remera-map"), file("remera-shade")]);
    assert.equal((await repo.getTemplate(shirtSlot)).imageUrl, file("remera-nueva"));
  });

  it("stores the mug curve and a sticker without warp", async () => {
    await repo.saveTemplate(admin, mugSlot, shirtInput({ imageUrl: file("taza"), area: { left: 340, top: 330, width: 400, height: 356 }, curve: 0.7 }));
    assert.equal((await repo.getTemplate(mugSlot)).curve, 0.7);
    const sticker = { kind: "sticker", tone: "light", side: "front" };
    await repo.saveTemplate(admin, sticker, shirtInput({ imageUrl: file("sticker"), warp: null }));
    assert.equal((await repo.getTemplate(sticker)).warp, null);
    assert.equal((await listTemplateOverrides(sql))["sticker-light-front"].warp, undefined);
  });

  it("refuses an area outside the template and files outside the soportes folder", async () => {
    await assert.rejects(() => repo.saveTemplate(admin, shirtSlot, shirtInput({ area: { left: 900, top: 0, width: 300, height: 375 } })));
    await assert.rejects(() => repo.saveTemplate(admin, shirtSlot, shirtInput({ imageUrl: "/media/disenos/x.png" })));
    assert.equal((await repo.getTemplate(shirtSlot)).imageUrl, file("remera-nueva"));
  });

  it("restores the built-in template and returns the removed files", async () => {
    const removed = await repo.deleteTemplate(admin, shirtSlot);
    assert.equal(removed.imageUrl, file("remera-nueva"));
    assert.equal(await repo.getTemplate(shirtSlot), null);
    assert.equal((await listTemplateOverrides(sql))["tshirt-dark-back"], undefined);
    await assert.rejects(() => repo.deleteTemplate(admin, shirtSlot), AdminDataError);
    const [log] = await sql.query(`SELECT entity_id FROM audit_logs WHERE action = 'design.template_reset'`);
    assert.equal(log.entity_id, "tshirt-dark-back");
  });

  it("saves a garment color's own photo in its slot, serves it by color and resets it", async () => {
    const crema = { kind: "tshirt", tone: "crema", side: "front" };
    assert.equal(await repo.saveTemplate(admin, crema, shirtInput({ imageUrl: file("crema") })), null);
    const saved = await repo.getTemplate(crema);
    assert.deepEqual({ ...saved, updatedAt: undefined }, { ...crema, ...shirtInput({ imageUrl: file("crema") }), updatedAt: undefined });
    const overrides = await listTemplateOverrides(sql);
    assert.deepEqual(overrides["tshirt-crema-front"], { src: file("crema"), area: shirtInput().area, warp: shirtInput().warp });
    assert.equal(mockupTemplate("tshirt", "light", "front", overrides, "crema").src, file("crema"));
    const [log] = await sql.query(`SELECT entity_id FROM audit_logs WHERE action = 'design.template' AND entity_id = 'tshirt-crema-front'`);
    assert.deepEqual(log, { entity_id: "tshirt-crema-front" });

    const removed = await repo.deleteTemplate(admin, crema);
    assert.equal(removed.imageUrl, file("crema"));
    assert.equal(await repo.getTemplate(crema), null);
    const after = await listTemplateOverrides(sql);
    assert.equal(after["tshirt-crema-front"], undefined);
    assert.notEqual(mockupTemplate("tshirt", "light", "front", after, "crema").src, file("crema"));
    const [reset] = await sql.query(`SELECT entity_id FROM audit_logs WHERE action = 'design.template_reset' AND entity_id = 'tshirt-crema-front'`);
    assert.deepEqual(reset, { entity_id: "tshirt-crema-front" });
  });

  it("refuses a tone that is neither light, dark nor a color key, and colors on kinds without colors", async () => {
    const count = async () => (await sql.query(`SELECT count(*)::int AS n FROM mockup_templates`))[0].n;
    const logs = async () => (await sql.query(`SELECT count(*)::int AS n FROM audit_logs`))[0].n;
    const [rows, logged] = [await count(), await logs()];
    for (const slot of [
      { kind: "tshirt", tone: "Crema", side: "front" },
      { kind: "mug", tone: "negro", side: "front" },
      { kind: "sticker", tone: "dark", side: "front" },
      { kind: "tshirt", tone: "crema", side: "costado" },
    ]) {
      await assert.rejects(() => repo.saveTemplate(admin, slot, shirtInput()), (error) => error instanceof AdminDataError && /no existe/.test(error.message));
      await assert.rejects(() => repo.deleteTemplate(admin, slot), (error) => error instanceof AdminDataError && /no existe/.test(error.message));
    }
    assert.equal(await count(), rows);
    assert.equal(await logs(), logged);
  });

  it("still saves and resets the generic light and dark templates as before", async () => {
    const tankLight = { kind: "tank", tone: "light", side: "front" };
    assert.equal(await repo.saveTemplate(admin, tankLight, shirtInput({ imageUrl: file("musculosa") })), null);
    assert.equal((await listTemplateOverrides(sql))["tank-light-front"].src, file("musculosa"));
    assert.equal(mockupTemplate("tank", "light", "front", await listTemplateOverrides(sql), "blanco").src, file("musculosa"));
    assert.equal((await repo.deleteTemplate(admin, tankLight)).imageUrl, file("musculosa"));
    assert.equal(await repo.getTemplate(tankLight), null);
    const actions = await sql.query(`SELECT action FROM audit_logs WHERE entity_id = 'tank-light-front' ORDER BY id`);
    assert.deepEqual(actions.map((row) => row.action), ["design.template", "design.template_reset"]);
  });
});

describe("oversize T-shirt templates in the database", () => {
  let db;
  let repo;
  let sql;

  before(async () => {
    db = new PGlite();
    for (const text of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createMockupTemplateRepository(sql);
  });

  after(async () => {
    await db.close();
  });

  it("stores an oversize generic slot and a color slot, and serves them instead of the T-shirt fallback", async () => {
    const dark = { kind: "oversize", tone: "dark", side: "front" };
    const crema = { kind: "oversize", tone: "crema", side: "back" };
    assert.equal(await repo.saveTemplate(admin, dark, shirtInput({ imageUrl: file("oversize-negra") })), null);
    assert.equal(await repo.saveTemplate(admin, crema, shirtInput({ imageUrl: file("oversize-crema") })), null);
    const overrides = await listTemplateOverrides(sql);
    assert.equal(mockupTemplate("oversize", "dark", "front", overrides).src, file("oversize-negra"));
    assert.equal(mockupTemplate("oversize", "light", "back", overrides, "crema").src, file("oversize-crema"));
    // The classic T-shirt keeps its own templates.
    assert.equal(mockupTemplate("tshirt", "dark", "front", overrides).src, MOCKUPS.tshirt.templates["dark-front"].src);
    const logs = await sql.query(`SELECT entity_id FROM audit_logs WHERE action = 'design.template' ORDER BY id`);
    assert.deepEqual(logs.map((row) => row.entity_id), ["oversize-dark-front", "oversize-crema-back"]);
    assert.equal((await repo.deleteTemplate(admin, dark)).imageUrl, file("oversize-negra"));
    assert.equal(mockupTemplate("oversize", "dark", "front", await listTemplateOverrides(sql)).src, MOCKUPS.tshirt.templates["dark-front"].src);
  });

  it("still refuses a kind the catalog does not have", async () => {
    await assert.rejects(
      () => sql.query(`INSERT INTO mockup_templates (kind, tone, side, image_url, area_left, area_top, area_width, area_height) VALUES ('gorra', 'light', 'front', $1, 0, 0, 100, 100)`, [file("gorra")]),
      /mockup_templates_kind_check/,
    );
  });
});

describe("uploaded template photos and their warps", async () => {
  const sharp = (await import("sharp")).default;
  const { cylinderWarp, fabricWarp, prepareTemplatePhoto, TemplatePhotoError } = await import("../src/server/mockups/warp.ts");
  const pixel = async (png, left, top) => [...(await sharp(png).ensureAlpha().extract({ left, top, width: 1, height: 1 }).raw().toBuffer())];
  // A grey "garment" on a white studio background.
  const studioPhoto = (format = "jpeg") =>
    sharp({ create: { width: 1200, height: 900, channels: 3, background: "#ffffff" } })
      .composite([{ input: { create: { width: 500, height: 600, channels: 3, background: "#3a3a3a" } }, left: 350, top: 150 }])
      .toFormat(format)
      .toBuffer();

  it("turns a photo into a square template with its white background cut away", async () => {
    const png = await prepareTemplatePhoto(await studioPhoto());
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ["png", TEMPLATE_PX, TEMPLATE_PX, true]);
    assert.equal((await pixel(png, 5, 5))[3], 0, "background corner stays");
    assert.equal((await pixel(png, 540, 540))[3], 255, "the garment was cut");
  });

  it("keeps the transparency of a PNG that already has it", async () => {
    const transparent = await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 400, height: 400, channels: 4, background: "#ffffff" } }, left: 200, top: 200 }])
      .png()
      .toBuffer();
    const png = await prepareTemplatePhoto(transparent);
    // White touching the transparent area is the product, not background.
    assert.deepEqual(await pixel(png, 540, 540), [255, 255, 255, 255]);
    assert.equal((await pixel(png, 5, 5))[3], 0);
  });

  it("refuses small photos, other formats and empty files with a message", async () => {
    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await assert.rejects(() => prepareTemplatePhoto(small), (error) => error instanceof TemplatePhotoError && /muy chica/.test(error.message));
    await assert.rejects(() => prepareTemplatePhoto(new TextEncoder().encode("<svg/>")), TemplatePhotoError);
    await assert.rejects(() => prepareTemplatePhoto(new Uint8Array()), /vacío/);
    const tiff = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#ffffff" } }).tiff().toBuffer();
    await assert.rejects(() => prepareTemplatePhoto(tiff), /Formato no admitido/);
  });

  it("makes fabric warp maps sized like the print area", async () => {
    const png = await prepareTemplatePhoto(await studioPhoto("png"));
    const area = { left: 400, top: 300, width: 200, height: 250 };
    const { map, shade, scale } = await fabricWarp(png, area, 10);
    assert.equal(scale, 10);
    for (const file of [map, shade]) {
      const { width, height } = await sharp(file).metadata();
      assert.deepEqual([width, height], [200, 250]);
    }
  });

  it("wraps a mug design around the cylinder: wide in the middle, squeezed toward the sides", async () => {
    const area = { width: 400, height: 356 };
    const { map, shade, scale } = await cylinderWarp(area, 0.7);
    const { width, height } = await sharp(map).metadata();
    assert.deepEqual([width, height], [400, 356]);
    const offset = async (x) => scale * ((await pixel(map, x, 100))[0] / 255 - 0.5);
    assert.ok(Math.abs(await offset(200)) <= 1, "the middle column reads the middle of the design");
    // Halfway to each side the design is still near its middle (stretched there), and both edges meet the design's edges.
    assert.ok((await offset(300)) < -8, "right half reads closer to the middle of the design");
    assert.ok((await offset(100)) > 8, "left half reads closer to the middle of the design");
    assert.ok(Math.abs(await offset(399)) <= 2 && Math.abs(await offset(0)) <= 2, "the edges show the design's edges");
    assert.ok((await pixel(shade, 395, 100))[0] < (await pixel(shade, 200, 100))[0], "the sides are darker");
    // Curve 0 is a flat print.
    const flat = await cylinderWarp(area, 0);
    assert.ok(Math.abs(flat.scale * ((await pixel(flat.map, 390, 10))[0] / 255 - 0.5)) <= 1);
  });
});

describe("Soportes flow: upload, print area and reset", async () => {
  const sharp = (await import("sharp")).default;
  const { resetTemplate, updateTemplateArea, uploadTemplatePhoto } = await import("../src/server/mockups/template-flow.ts");
  const { TemplatePhotoError } = await import("../src/server/mockups/warp.ts");
  const photo = () =>
    sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } })
      .composite([{ input: { create: { width: 500, height: 700, channels: 3, background: "#222222" } }, left: 290, top: 200 }])
      .jpeg()
      .toBuffer();

  /** In-memory repository and media disk. */
  function fakes({ failSave = false } = {}) {
    const rows = new Map();
    const files = new Map();
    let n = 0;
    const deps = {
      repo: {
        getTemplate: async (slot) => rows.get(`${slot.kind}-${slot.tone}-${slot.side}`) ?? null,
        saveTemplate: async (_actor, slot, input) => {
          if (failSave) throw new Error("db down");
          const key = `${slot.kind}-${slot.tone}-${slot.side}`;
          const previous = rows.get(key) ?? null;
          rows.set(key, { ...slot, ...input, updatedAt: new Date() });
          return previous;
        },
        deleteTemplate: async (_actor, slot) => {
          const key = `${slot.kind}-${slot.tone}-${slot.side}`;
          const current = rows.get(key);
          if (!current) throw new AdminDataError("not_found", "Ese soporte ya usa la imagen original.");
          rows.delete(key);
          return current;
        },
      },
      save: async (name, png) => {
        const url = `/media/soportes/${name}-${++n}.png`;
        files.set(url, png);
        return url;
      },
      read: async (url) => files.get(url) ?? null,
      remove: async (urls) => urls.forEach((url) => files.delete(url)),
    };
    return { deps, rows, files };
  }

  it("uploads a garment photo with the starting print area and a fabric warp", async () => {
    const { deps, rows, files } = fakes();
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    const saved = rows.get("tshirt-dark-back");
    assert.deepEqual(saved.area, startingArea(shirtSlot));
    assert.equal(saved.curve, null);
    assert.equal(saved.warp.scale, 10);
    assert.deepEqual([...files.keys()].sort(), [saved.imageUrl, saved.warp.map, saved.warp.shade].sort());
  });

  it("keeps the marked area on a new photo and deletes the replaced files", async () => {
    const { deps, rows, files } = fakes();
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    await updateTemplateArea(deps, admin, shirtSlot, { left: 380, top: 280, width: 300 }, null);
    const marked = rows.get("tshirt-dark-back").area;
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    const saved = rows.get("tshirt-dark-back");
    assert.deepEqual(saved.area, marked);
    assert.deepEqual([...files.keys()].sort(), [saved.imageUrl, saved.warp.map, saved.warp.shade].sort());
  });

  it("refits the marked area, rebuilds the warp and keeps the photo", async () => {
    const { deps, rows, files } = fakes();
    await uploadTemplatePhoto(deps, admin, mugSlot, await photo());
    const before = rows.get("mug-light-front");
    assert.equal(before.curve, 0.7);
    await updateTemplateArea(deps, admin, mugSlot, { left: 2000, top: 100, width: 300 }, 0.25);
    const after = rows.get("mug-light-front");
    assert.equal(after.imageUrl, before.imageUrl);
    assert.deepEqual(after.area, fitTemplateArea("mug", { left: 2000, top: 100, width: 300 }));
    assert.equal(after.curve, 0.25);
    assert.notEqual(after.warp.map, before.warp.map);
    assert.deepEqual([...files.keys()].sort(), [after.imageUrl, after.warp.map, after.warp.shade].sort());
  });

  it("gives a sticker photo no warp and refuses an area before any photo", async () => {
    const { deps, rows } = fakes();
    const sticker = { kind: "sticker", tone: "light", side: "front" };
    await assert.rejects(() => updateTemplateArea(deps, admin, sticker, { left: 0, top: 0, width: 300 }, null), /Subí una foto/);
    await uploadTemplatePhoto(deps, admin, sticker, await photo());
    assert.equal(rows.get("sticker-light-front").warp, null);
  });

  it("stores nothing for a photo that cannot be used, and cleans up when saving fails", async () => {
    const bad = fakes();
    const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } }).png().toBuffer();
    await assert.rejects(() => uploadTemplatePhoto(bad.deps, admin, shirtSlot, tiny), TemplatePhotoError);
    assert.equal(bad.files.size, 0);
    const failing = fakes({ failSave: true });
    const good = await photo();
    await assert.rejects(() => uploadTemplatePhoto(failing.deps, admin, shirtSlot, good), /db down/);
    assert.equal(failing.files.size, 0);
  });

  it("goes back to the built-in image and deletes the uploaded files", async () => {
    const { deps, rows, files } = fakes();
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    await resetTemplate(deps, admin, shirtSlot);
    assert.equal(rows.size, 0);
    assert.equal(files.size, 0);
    await assert.rejects(() => resetTemplate(deps, admin, shirtSlot), AdminDataError);
  });

  it("uploads a garment color's own photo with that color's tone area and a fabric warp", async () => {
    const { deps, rows, files } = fakes();
    const negro = { kind: "tshirt", tone: "negro", side: "front" };
    await uploadTemplatePhoto(deps, admin, negro, await photo());
    const saved = rows.get("tshirt-negro-front");
    assert.deepEqual(saved.area, startingArea({ kind: "tshirt", tone: "dark", side: "front" }));
    assert.equal(saved.warp.scale, 10);
    assert.ok([saved.imageUrl, saved.warp.map, saved.warp.shade].every((url) => url.startsWith("/media/soportes/tshirt-negro-front")));
    await updateTemplateArea(deps, admin, negro, { left: 380, top: 280, width: 300 }, null);
    assert.deepEqual(rows.get("tshirt-negro-front").area, fitTemplateArea("tshirt", { left: 380, top: 280, width: 300 }));
    await resetTemplate(deps, admin, negro);
    assert.equal(rows.size, 0);
    assert.equal(files.size, 0);
  });

  it("refuses a slot that does not exist before storing any file", async () => {
    const { deps, rows, files } = fakes();
    for (const slot of [
      { kind: "tshirt", tone: "Crema", side: "front" },
      { kind: "mug", tone: "negro", side: "front" },
    ]) {
      await assert.rejects(() => uploadTemplatePhoto(deps, admin, slot, new Uint8Array()), (error) => error instanceof AdminDataError && /no existe/.test(error.message));
      await assert.rejects(() => updateTemplateArea(deps, admin, slot, { left: 0, top: 0, width: 300 }, null), AdminDataError);
      await assert.rejects(() => resetTemplate(deps, admin, slot), (error) => error instanceof AdminDataError && /no existe/.test(error.message));
    }
    assert.equal(rows.size, 0);
    assert.equal(files.size, 0);
  });
});

describe("garment zone of uploaded photos (Admin › Soportes)", async () => {
  const sharp = (await import("sharp")).default;
  const { fitGarmentZone } = await import("../src/lib/designs/mockups.ts");
  const { updateTemplateArea, updateTemplateGarment, uploadTemplatePhoto } = await import("../src/server/mockups/template-flow.ts");
  const photo = () => sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#222222" } }).jpeg().toBuffer();
  const area = { left: 400, top: 300, width: 280, height: 350 };
  let db;
  let repo;
  let sql;
  let deps;

  before(async () => {
    db = new PGlite();
    for (const text of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createMockupTemplateRepository(sql);
    const files = new Map();
    let n = 0;
    deps = {
      repo,
      save: async (name, png) => {
        const url = `/media/soportes/${name}-${String(++n).padStart(24, "0")}.png`;
        files.set(url, png);
        return url;
      },
      read: async (url) => files.get(url) ?? null,
      remove: async (urls) => urls.forEach((url) => files.delete(url)),
    };
  });

  after(async () => {
    await db.close();
  });

  it("fits a zone inside the photo, at least MIN_AREA_PX on each side and holding the print area", () => {
    assert.deepEqual(fitGarmentZone("tshirt", { left: 250.4, top: 150.6, width: 600.2, height: 800.5 }, area), { left: 250, top: 151, width: 600, height: 801 });
    // Outside the photo: pulled back in.
    assert.deepEqual(fitGarmentZone("tshirt", { left: 900, top: -40, width: 400, height: 2000 }, area), { left: 400, top: 0, width: 680, height: TEMPLATE_PX });
    // Too small and away from the print area: grown to hold it.
    const small = fitGarmentZone("tank", { left: 0, top: 0, width: 10, height: 10 }, area);
    assert.deepEqual(small, { left: 0, top: 0, width: area.left + area.width, height: area.top + area.height });
    const tiny = fitGarmentZone("oversize", { left: 450, top: 350, width: 1, height: 1 }, { left: 450, top: 350, width: 50, height: 60 });
    assert.ok(tiny.width >= MIN_AREA_PX && tiny.height >= MIN_AREA_PX);
    assert.deepEqual(fitGarmentZone("tshirt", { left: Number.NaN, top: 0, width: Number.NaN, height: 900 }, area).left, 0);
    // The mug and the sticker keep the design in the print area.
    assert.deepEqual(fitGarmentZone("mug", { left: 0, top: 0, width: 1000, height: 1000 }, area), area);
  });

  it("refuses a partial zone or one that leaves the photo", async () => {
    await repo.saveTemplate(admin, shirtSlot, shirtInput());
    const set = (columns) => sql.query(`UPDATE mockup_templates SET ${columns} WHERE kind = 'tshirt' AND tone = 'dark' AND side = 'back'`);
    await assert.rejects(() => set("garment_left = 10"), /check/i);
    await assert.rejects(() => set("garment_left = 900, garment_top = 0, garment_width = 300, garment_height = 300"), /check/i);
    await assert.rejects(() => set("garment_left = 0, garment_top = 900, garment_width = 300, garment_height = 300"), /check/i);
    await assert.rejects(() => set("garment_left = 0, garment_top = 0, garment_width = 0, garment_height = 300"), /check/i);
    await assert.rejects(() => set("garment_left = -1, garment_top = 0, garment_width = 100, garment_height = 300"), /check/i);
    await set("garment_left = 0, garment_top = 0, garment_width = 1080, garment_height = 1080");
    await repo.deleteTemplate(admin, shirtSlot);
  });

  it("reads rows without a zone back without garment, for the admin and the store", async () => {
    await repo.saveTemplate(admin, shirtSlot, shirtInput());
    assert.equal("garment" in (await repo.getTemplate(shirtSlot)), false);
    assert.equal("garment" in (await listTemplateOverrides(sql))["tshirt-dark-back"], false);
    await repo.deleteTemplate(admin, shirtSlot);
  });

  it("uploads a photo with an automatic zone, stores a fitted zone, logs it and serves it to the store", async () => {
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    const uploaded = await repo.getTemplate(shirtSlot);
    assert.equal(uploaded.garment, undefined);
    await updateTemplateGarment(deps, admin, shirtSlot, { left: -50, top: 120, width: 700, height: 2000 });
    const zone = fitGarmentZone("tshirt", { left: -50, top: 120, width: 700, height: 2000 }, uploaded.area);
    assert.deepEqual((await repo.getTemplate(shirtSlot)).garment, zone);
    const overrides = await listTemplateOverrides(sql);
    assert.deepEqual(overrides["tshirt-dark-back"].garment, zone);
    assert.deepEqual(mockupTemplate("tshirt", "dark", "back", overrides).garment, zone);
    const [log] = await sql.query(`SELECT entity_id, changes FROM audit_logs WHERE action = 'design.template_garment' ORDER BY id DESC LIMIT 1`);
    assert.equal(log.entity_id, "tshirt-dark-back");
    assert.deepEqual(log.changes, { garment: zone });
  });

  it("keeps the stored zone when the print area or the photo changes", async () => {
    const zone = (await repo.getTemplate(shirtSlot)).garment;
    await updateTemplateArea(deps, admin, shirtSlot, { left: 380, top: 280, width: 300 }, null);
    const moved = await repo.getTemplate(shirtSlot);
    assert.deepEqual(moved.area, fitTemplateArea("tshirt", { left: 380, top: 280, width: 300 }));
    assert.deepEqual(moved.garment, zone);
    await uploadTemplatePhoto(deps, admin, shirtSlot, await photo());
    const replaced = await repo.getTemplate(shirtSlot);
    assert.notEqual(replaced.imageUrl, moved.imageUrl);
    assert.deepEqual(replaced.area, moved.area);
    assert.deepEqual(replaced.garment, zone);
  });

  it("goes back to the automatic zone with null", async () => {
    await updateTemplateGarment(deps, admin, shirtSlot, null);
    assert.equal((await repo.getTemplate(shirtSlot)).garment, undefined);
    const overrides = await listTemplateOverrides(sql);
    assert.equal("garment" in overrides["tshirt-dark-back"], false);
    const [log] = await sql.query(`SELECT changes FROM audit_logs WHERE action = 'design.template_garment' ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(log.changes, { garment: null });
  });

  it("refuses a zone before any photo, on kinds without free placement and on unknown slots", async () => {
    const tank = { kind: "tank", tone: "light", side: "front" };
    await assert.rejects(() => updateTemplateGarment(deps, admin, tank, null), /Subí una foto/);
    await assert.rejects(() => updateTemplateGarment(deps, admin, mugSlot, { left: 0, top: 0, width: 500, height: 500 }), AdminDataError);
    await assert.rejects(() => updateTemplateGarment(deps, admin, { kind: "tshirt", tone: "Crema", side: "front" }, null), /no existe/);
  });
});
