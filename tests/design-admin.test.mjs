// Admin design flow: file checks, creation, storage and publishing, with cleanup on failure.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createDesignWithFile, deleteDesignWithFiles, replaceDesignFile } from "../src/server/designs/admin-flow.ts";
import { DesignFileError, prepareDesignFile } from "../src/server/designs/files.ts";
import { createDesignRepository } from "../src/server/designs/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const input = (overrides = {}) => ({ name: "Gato astronauta", slug: "gato-astronauta", description: "", categoryId: null, kinds: ["tshirt", "mug"], ...overrides });
const png = (background = { r: 0, g: 0, b: 0, alpha: 0 }) =>
  sharp({ create: { width: 600, height: 600, channels: 4, background } }).png().toBuffer();

/** In-memory stand-in for the media disk. */
function fakeStorage() {
  const files = new Set();
  let counter = 0;
  return {
    files,
    failNext: false,
    async store(slug) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error("disk full");
      }
      counter += 1;
      const stored = { imageUrl: `/media/disenos/${slug}-${counter}.webp`, sourcePath: `disenos/${slug}-${counter}.png` };
      files.add(stored.imageUrl).add(stored.sourcePath);
      return stored;
    },
    async remove(stored) {
      files.delete(stored.imageUrl);
      files.delete(stored.sourcePath);
    },
  };
}

describe("admin design flow", () => {
  let db;
  let repo;
  let storage;
  const deps = () => ({ repo, prepare: prepareDesignFile, store: (slug, prepared) => storage.store(slug, prepared), remove: (files) => storage.remove(files) });
  const designCount = async () => Number((await db.query(`SELECT count(*)::int AS n FROM designs`)).rows[0].n);

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    repo = createDesignRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });

  beforeEach(async () => {
    storage = fakeStorage();
    await db.exec(`DELETE FROM design_bases; DELETE FROM designs;`);
  });

  after(async () => {
    await db.close();
  });

  it("refuses a bad file before creating anything", async () => {
    await assert.rejects(
      () => createDesignWithFile(deps(), admin, input(), new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), { publish: true }),
      (error) => error instanceof DesignFileError && /Formato no admitido/.test(error.message),
    );
    assert.equal(await designCount(), 0);
    assert.equal(storage.files.size, 0);
  });

  it("creates the draft, stores both files and points the design at them", async () => {
    const result = await createDesignWithFile(deps(), admin, input(), await png(), { publish: false });
    const design = await repo.getDesign(result.id);
    assert.equal(design.status, "draft");
    assert.equal(design.imageUrl, "/media/disenos/gato-astronauta-1.webp");
    assert.equal(design.sourcePath, "disenos/gato-astronauta-1.png");
    assert.deepEqual([design.width, design.height, design.opaque], [600, 600, false]);
    assert.deepEqual([result.warning, result.publishError], [null, null]);
    assert.equal(storage.files.size, 2);
  });

  it("publishes right away when asked", async () => {
    const result = await createDesignWithFile(deps(), admin, input(), await png(), { publish: true });
    assert.equal((await repo.getDesign(result.id)).status, "published");
    assert.equal(result.publishError, null);
  });

  it("keeps the draft and returns the conflict message when it cannot be published", async () => {
    const result = await createDesignWithFile(deps(), admin, input({ kinds: [] }), await png(), { publish: true });
    const design = await repo.getDesign(result.id);
    assert.equal(design.status, "draft");
    assert.equal(design.imageUrl, "/media/disenos/gato-astronauta-1.webp");
    assert.equal(result.publishError, "Elegí en qué productos está disponible antes de publicarlo.");
  });

  it("warns when the image has no transparency", async () => {
    const result = await createDesignWithFile(deps(), admin, input(), await png("#ffffff"), { publish: false });
    assert.match(result.warning, /fondo transparente/);
    assert.equal((await repo.getDesign(result.id)).opaque, true);
  });

  it("removes the created design when storing the files fails", async () => {
    storage.failNext = true;
    await assert.rejects(async () => createDesignWithFile(deps(), admin, input(), await png(), { publish: true }), /disk full/);
    assert.equal(await designCount(), 0);
    assert.equal(storage.files.size, 0);
  });

  it("leaves no orphan files when pointing the design at them fails", async () => {
    const failing = { ...repo, setDesignImage: async () => Promise.reject(new Error("db down")) };
    await assert.rejects(async () => createDesignWithFile({ ...deps(), repo: failing }, admin, input(), await png(), { publish: false }), /db down/);
    assert.equal(await designCount(), 0);
    assert.equal(storage.files.size, 0);
  });

  it("propagates a duplicated slug without storing files", async () => {
    await createDesignWithFile(deps(), admin, input(), await png(), { publish: false });
    await assert.rejects(
      async () => createDesignWithFile(deps(), admin, input(), await png(), { publish: false }),
      (error) => error instanceof AdminDataError && error.code === "conflict",
    );
    assert.equal(await designCount(), 1);
    assert.equal(storage.files.size, 2);
  });

  it("replaces the file and deletes the previous one", async () => {
    const { id } = await createDesignWithFile(deps(), admin, input(), await png(), { publish: false });
    const result = await replaceDesignFile(deps(), admin, id, await png("#ffffff"));
    const design = await repo.getDesign(id);
    assert.equal(design.imageUrl, "/media/disenos/gato-astronauta-2.webp");
    assert.equal(design.opaque, true);
    assert.match(result.warning, /fondo transparente/);
    assert.deepEqual([...storage.files].sort(), ["/media/disenos/gato-astronauta-2.webp", "disenos/gato-astronauta-2.png"]);
  });

  it("keeps the current file when the replacement is invalid or cannot be saved", async () => {
    const { id } = await createDesignWithFile(deps(), admin, input(), await png(), { publish: false });
    await assert.rejects(() => replaceDesignFile(deps(), admin, id, new Uint8Array([1, 2, 3])), DesignFileError);
    const failing = { ...repo, setDesignImage: async () => Promise.reject(new Error("db down")) };
    await assert.rejects(async () => replaceDesignFile({ ...deps(), repo: failing }, admin, id, await png()), /db down/);
    assert.equal((await repo.getDesign(id)).imageUrl, "/media/disenos/gato-astronauta-1.webp");
    assert.deepEqual([...storage.files].sort(), ["/media/disenos/gato-astronauta-1.webp", "disenos/gato-astronauta-1.png"]);
  });

  it("deletes the design together with its files", async () => {
    const { id } = await createDesignWithFile(deps(), admin, input(), await png(), { publish: false });
    await deleteDesignWithFiles(deps(), admin, id);
    assert.equal(await designCount(), 0);
    assert.equal(storage.files.size, 0);
  });
});
