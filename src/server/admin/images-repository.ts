import type { QueryFn } from "../customers/repository.ts";
import type { ImageInfo } from "../media/image-file.ts";
import { AdminDataError, type Admin } from "./repository.ts";

export const MAX_IMAGES_PER_PRODUCT = 12;

export type AdminImage = {
  id: string;
  url: string;
  alt: string;
  position: number;
  /** Uploaded to storage (vs. the original catalog files in /public). */
  uploaded: boolean;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
};

export type ImageMove = "first" | "up" | "down";

type ImageRow = {
  id: string;
  url: string;
  alt: string;
  sort_order: number;
  pathname: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
};

const toImage = (row: ImageRow): AdminImage => ({
  id: row.id,
  url: row.url,
  alt: row.alt,
  position: row.sort_order,
  uploaded: row.pathname !== null,
  width: row.width,
  height: row.height,
  sizeBytes: row.size_bytes,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

function assertIds(productId: string, imageId?: string) {
  if (!PRODUCT_ID.test(productId)) throw new AdminDataError("not_found", "El producto no existe.");
  if (imageId !== undefined && !UUID.test(imageId)) throw new AdminDataError("not_found", "La imagen no existe.");
}

/** New order after moving one image; positions are 0-based and contiguous. */
export function reorder(ids: readonly string[], imageId: string, move: ImageMove): string[] {
  const index = ids.indexOf(imageId);
  if (index < 0) throw new AdminDataError("not_found", "La imagen no existe.");
  const next = [...ids];
  next.splice(index, 1);
  const target = move === "first" ? 0 : move === "up" ? Math.max(0, index - 1) : Math.min(ids.length - 1, index + 1);
  next.splice(target, 0, imageId);
  return next;
}

const audit = `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)`;

/**
 * Product images. Position 0 is the cover shown on cards. Every change is one
 * statement with its audit entry; the (product, position) uniqueness is checked
 * at commit (0005), so reordering can swap positions freely.
 */
export function createImageRepository(sql: QueryFn) {
  async function listImages(productId: string): Promise<AdminImage[]> {
    assertIds(productId);
    const rows = (await sql.query(
      `SELECT im.id, im.url, im.alt, im.sort_order, im.pathname, im.width, im.height, im.size_bytes
       FROM product_images im JOIN products p ON p.id = im.product_id
       WHERE p.legacy_id = $1 ORDER BY im.sort_order`,
      [productId],
    )) as ImageRow[];
    return rows.map(toImage);
  }

  return {
    listImages,

    /** Appends an uploaded image; refuses past the per-product limit. */
    async addImage(actor: Admin, productId: string, image: { url: string; pathname: string; alt: string; info: ImageInfo }) {
      assertIds(productId);
      const rows = (await sql.query(
        `WITH target AS (
           SELECT p.id, (SELECT count(*) FROM product_images WHERE product_id = p.id) AS total,
                  (SELECT coalesce(max(sort_order) + 1, 0) FROM product_images WHERE product_id = p.id) AS next_position
           FROM products p WHERE p.legacy_id = $1
         ),
         added AS (
           INSERT INTO product_images (product_id, url, alt, sort_order, pathname, content_type, width, height, size_bytes)
           SELECT id, $2, $3, next_position, $4, $5, $6, $7, $8 FROM target WHERE total < $9
           RETURNING id
         ),
         logged AS (
           ${audit}
           SELECT $10, $11, 'image.add', 'product', $1, jsonb_build_object('url', $2::text, 'alt', $3::text) FROM added
         )
         SELECT (SELECT count(*) FROM target)::int AS found, (SELECT count(*) FROM added)::int AS added`,
        [
          productId,
          image.url,
          image.alt,
          image.pathname,
          image.info.type,
          image.info.width,
          image.info.height,
          image.info.size,
          MAX_IMAGES_PER_PRODUCT,
          actor.authUserId,
          actor.email,
        ],
      )) as { found: number; added: number }[];
      if (!rows[0]?.found) throw new AdminDataError("not_found", "El producto no existe.");
      if (!rows[0].added) throw new AdminDataError("conflict", `Cada producto admite hasta ${MAX_IMAGES_PER_PRODUCT} imágenes.`);
    },

    async updateAlt(actor: Admin, productId: string, imageId: string, alt: string) {
      assertIds(productId, imageId);
      const rows = (await sql.query(
        `WITH current AS (
           SELECT im.id, im.alt FROM product_images im JOIN products p ON p.id = im.product_id
           WHERE p.legacy_id = $1 AND im.id = $2
         ),
         updated AS (UPDATE product_images SET alt = $3 FROM current WHERE product_images.id = current.id RETURNING product_images.id),
         logged AS (
           ${audit}
           SELECT $4, $5, 'image.alt', 'product', $1, jsonb_build_object('before', alt, 'after', $3::text)
           FROM current WHERE alt <> $3
         )
         SELECT count(*)::int AS found FROM updated`,
        [productId, imageId, alt, actor.authUserId, actor.email],
      )) as { found: number }[];
      if (!rows[0]?.found) throw new AdminDataError("not_found", "La imagen no existe.");
    },

    async moveImage(actor: Admin, productId: string, imageId: string, move: ImageMove) {
      assertIds(productId, imageId);
      const current = await listImages(productId);
      const order = reorder(
        current.map((image) => image.id),
        imageId,
        move,
      );
      await sql.query(
        `WITH product AS (SELECT id FROM products WHERE legacy_id = $1),
         moved AS (
           UPDATE product_images SET sort_order = o.position - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, position), product
           WHERE product_images.id = o.id AND product_images.product_id = product.id
           RETURNING product_images.id
         )
         ${audit}
         SELECT $3, $4, 'image.move', 'product', $1, jsonb_build_object('image', $5::text, 'move', $6::text)
         FROM product WHERE (SELECT count(*) FROM moved) > 0`,
        [productId, order, actor.authUserId, actor.email, imageId, move],
      );
    },

    /** Removes the image and closes the gap in positions; returns its URL to delete the file. */
    async removeImage(actor: Admin, productId: string, imageId: string): Promise<string> {
      assertIds(productId, imageId);
      const rows = (await sql.query(
        `WITH product AS (SELECT id FROM products WHERE legacy_id = $1),
         removed AS (
           DELETE FROM product_images USING product
           WHERE product_images.id = $2 AND product_images.product_id = product.id
           RETURNING product_images.id, product_images.url, product_images.alt
         ),
         renumbered AS (
           UPDATE product_images SET sort_order = r.position
           FROM (
             SELECT im.id, row_number() OVER (ORDER BY im.sort_order) - 1 AS position
             FROM product_images im, product
             WHERE im.product_id = product.id AND im.id NOT IN (SELECT id FROM removed)
           ) r
           WHERE product_images.id = r.id
           RETURNING product_images.id
         ),
         logged AS (
           ${audit}
           SELECT $3, $4, 'image.remove', 'product', $1, jsonb_build_object('url', url, 'alt', alt) FROM removed
         )
         SELECT url FROM removed`,
        [productId, imageId, actor.authUserId, actor.email],
      )) as { url: string }[];
      if (!rows[0]) throw new AdminDataError("not_found", "La imagen no existe.");
      return rows[0].url;
    },
  };
}

export type ImageRepository = ReturnType<typeof createImageRepository>;
