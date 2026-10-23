import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { hasBlobStorage, isBlobUrl } from "../src/server/media/blob.ts";
import { ImageFileError, inspectImage, MAX_IMAGE_BYTES } from "../src/server/media/image-file.ts";

const image = async (format, width, height, options = {}) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 90 } } })
      .toFormat(format, options)
      .toBuffer(),
  );

const rejects = (bytes, pattern) =>
  assert.throws(
    () => inspectImage(bytes),
    (error) => error instanceof ImageFileError && pattern.test(error.message),
  );

describe("image upload validation (type from bytes, size, dimensions)", () => {
  for (const [format, type, extension] of [
    ["jpeg", "image/jpeg", "jpg"],
    ["png", "image/png", "png"],
    ["webp", "image/webp", "webp"],
  ]) {
    it(`reads ${format} type and dimensions from the file itself`, async () => {
      const info = inspectImage(await image(format, 1200, 800));
      assert.deepEqual([info.type, info.extension, info.width, info.height], [type, extension, 1200, 800]);
    });
  }

  it("reads lossless and extended WebP headers", async () => {
    const lossless = inspectImage(await image("webp", 640, 480, { lossless: true }));
    assert.deepEqual([lossless.width, lossless.height], [640, 480]);
    const extended = new Uint8Array(
      await sharp({ create: { width: 900, height: 700, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
        .webp()
        .toBuffer(),
    );
    assert.deepEqual([inspectImage(extended).width, inspectImage(extended).height], [900, 700]);
  });

  it("reads progressive JPEGs", async () => {
    const info = inspectImage(await image("jpeg", 1000, 1500, { progressive: true }));
    assert.deepEqual([info.width, info.height], [1000, 1500]);
  });

  it("rejects files that are not images even with an image name", () => {
    rejects(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), /Formato no admitido/);
    rejects(new TextEncoder().encode("GIF89a……"), /Formato no admitido/);
    rejects(new Uint8Array(), /Elegí una imagen/);
  });

  it("rejects images that are too small, too large in pixels or in bytes", async () => {
    rejects(await image("png", 300, 900), /entre 400 y 4000 px/);
    rejects(await image("jpeg", 4100, 1000), /entre 400 y 4000 px/);
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set([0xff, 0xd8, 0xff]);
    rejects(huge, /supera 4 MB/);
  });

  it("rejects truncated files whose size cannot be read", async () => {
    rejects((await image("png", 800, 800)).subarray(0, 12), /medidas/);
  });
});

describe("Blob storage guard", () => {
  it("needs the token and stays off in production unless enabled", () => {
    assert.equal(hasBlobStorage({}), false);
    assert.equal(hasBlobStorage({ BLOB_READ_WRITE_TOKEN: "x", VERCEL_ENV: "preview" }), true);
    assert.equal(hasBlobStorage({ BLOB_READ_WRITE_TOKEN: "x", VERCEL_ENV: "production" }), false);
    assert.equal(hasBlobStorage({ BLOB_READ_WRITE_TOKEN: "x", VERCEL_ENV: "production", SUBLIME_BLOB_IN_PRODUCTION: "enabled" }), true);
  });

  it("only treats public Blob URLs as deletable files", () => {
    assert.equal(isBlobUrl("https://abc123.public.blob.vercel-storage.com/productos/p1/imagen-x.webp"), true);
    assert.equal(isBlobUrl("/demo/products/remera-1.webp"), false);
    assert.equal(isBlobUrl("https://evil.example/public.blob.vercel-storage.com/x.png"), false);
  });
});
