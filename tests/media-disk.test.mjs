// Media disk: public photos and private attachments under MEDIA_ROOT.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { isSafePathname, resolveMediaPath, statMediaFile } from "../src/server/media/disk.ts";
import { deletePrivateFile, readPrivateFile, storePrivateFile } from "../src/server/media/private-files.ts";
import { deleteStoredImage, storeImage } from "../src/server/media/public-files.ts";

const png = { type: "image/png", extension: "png", width: 1, height: 1, size: 4 };

describe("media disk", () => {
  let root;
  const previous = process.env.MEDIA_ROOT;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "sublime-media-"));
    process.env.MEDIA_ROOT = root;
  });

  after(async () => {
    if (previous === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("accepts only plain relative pathnames", () => {
    assert.equal(isSafePathname("productos/p08/imagen-ab12.webp"), true);
    for (const bad of ["../x.png", "productos/../../x.png", "/etc/passwd", "productos\\x.png", "x.png", "a/b/c/d/e/x.png", "productos/.x.png", ""]) {
      assert.equal(isSafePathname(bad), false, bad);
    }
    assert.equal(resolveMediaPath("public", "../private/encargos/x.pdf", root), null);
  });

  it("stores, serves and deletes public photos under /media/", async () => {
    const stored = await storeImage("productos/p08", new Uint8Array([1, 2, 3, 4]), png);
    assert.match(stored.url, /^\/media\/productos\/p08\/imagen-[0-9a-f]{24}\.png$/);
    const file = await statMediaFile("public", stored.pathname);
    assert.equal(file?.size, 4);
    assert.deepEqual([...(await readFile(file.path))], [1, 2, 3, 4]);
    await deleteStoredImage(stored.url);
    assert.equal(await statMediaFile("public", stored.pathname), null);
  });

  it("keeps private files out of the public area", async () => {
    const pathname = await storePrivateFile("encargos", new TextEncoder().encode("%PDF-1.7"), { type: "application/pdf", extension: "pdf", size: 8 });
    assert.match(pathname, /^encargos\/archivo-[0-9a-f]{24}\.pdf$/);
    assert.equal(await statMediaFile("public", pathname), null, "never reachable through /media/");
    const file = await readPrivateFile(pathname);
    assert.equal(file?.size, 8);
    assert.equal(await new Response(file.stream).text(), "%PDF-1.7");
    await deletePrivateFile(pathname);
    assert.equal(await readPrivateFile(pathname), null);
  });
});
