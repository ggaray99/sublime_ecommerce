import type { QueryFn } from "../db/client.ts";
import { PROVINCES } from "../customers/validation.ts";
import { POINT_KINDS, type PointKind, type PointOfSale } from "../../lib/points.ts";

export { mapQuery, POINT_KINDS, type PointKind, type PointOfSale } from "../../lib/points.ts";

export type PointInput = Omit<PointOfSale, "id">;

export class PointError extends Error {}

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
const bool = (value: unknown) => value === true || value === "on" || value === "true";

const inRange = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Coordinates from what people paste: "-32.889, -68.845", or a Google Maps link
 * (".../@-32.889,-68.845,17z", "...?q=-32.889,-68.845", "...!3d-32.889!4d-68.845").
 * Returns null when nothing usable is found.
 */
export function parseLocation(raw: string): { latitude: number; longitude: number } | null {
  const value = decodeURIComponent(raw.trim());
  const number = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`!3d${number}!4d${number}`),
    new RegExp(`@${number},${number}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${number},\\s*${number}`),
    new RegExp(`^${number}\\s*,\\s*${number}$`),
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (inRange(latitude, longitude)) return { latitude: round(latitude), longitude: round(longitude) };
  }
  return null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Instagram handle without "@" or the profile URL around it. */
function instagramHandle(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

export function parsePoint(data: Data): { ok: true; value: PointInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = text(data, "name");
  if (!name || name.length > 80) errors.name = "Poné el nombre del lugar (hasta 80 caracteres).";
  const kind = (text(data, "kind") || "tienda") as PointKind;
  if (!(kind in POINT_KINDS)) errors.kind = "Elegí el tipo de lugar.";
  const address = text(data, "address");
  if (address.length < 3 || address.length > 160) errors.address = "Escribí la dirección (calle y número).";
  const city = text(data, "city");
  if (!city || city.length > 80) errors.city = "Escribí la localidad.";
  const province = text(data, "province");
  if (!(PROVINCES as readonly string[]).includes(province)) errors.province = "Elegí una provincia.";

  const locationRaw = text(data, "location");
  const location = locationRaw ? parseLocation(locationRaw) : null;
  if (locationRaw && !location) {
    errors.location = "No encontramos coordenadas: pegá el link de Google Maps del lugar o escribí “latitud, longitud”.";
  }

  const hours = text(data, "hours");
  if (hours.length > 160) errors.hours = "Hasta 160 caracteres.";
  const phone = text(data, "phone");
  if (phone.length > 40 || (phone && !/^[\d\s+()-]{6,40}$/.test(phone))) errors.phone = "Solo números, espacios, + y guiones.";
  const instagram = instagramHandle(text(data, "instagram"));
  if (instagram && !/^[a-z0-9._]{1,30}$/i.test(instagram)) errors.instagram = "Usuario de Instagram inválido (ej.: sublime.calcos).";
  const notes = text(data, "notes");
  if (notes.length > 300) errors.notes = "Hasta 300 caracteres.";
  const sortOrder = Number(text(data, "sortOrder") || data.sortOrder || 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) errors.sortOrder = "Un número de 0 a 999.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      kind,
      address,
      city,
      province,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      hours,
      phone,
      instagram,
      notes,
      active: data.active === undefined ? true : bool(data.active),
      sortOrder,
    },
  };
}

type PointRow = {
  id: string;
  name: string;
  kind: PointKind;
  address: string;
  city: string;
  province: string;
  latitude: string | number | null;
  longitude: string | number | null;
  hours: string;
  phone: string;
  instagram: string;
  notes: string;
  active: boolean;
  sort_order: number;
};

const toPoint = (row: PointRow): PointOfSale => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  address: row.address,
  city: row.city,
  province: row.province,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
  hours: row.hours,
  phone: row.phone,
  instagram: row.instagram,
  notes: row.notes,
  active: row.active,
  sortOrder: row.sort_order,
});

const COLUMNS = "id, name, kind, address, city, province, latitude, longitude, hours, phone, instagram, notes, active, sort_order";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

type Actor = { authUserId: string; email: string };

const params = (input: PointInput) => [
  input.name,
  input.kind,
  input.address,
  input.city,
  input.province,
  input.latitude,
  input.longitude,
  input.hours,
  input.phone,
  input.instagram,
  input.notes,
  input.active,
  input.sortOrder,
];

export function createPointRepository(sql: QueryFn) {
  return {
    /** Ordered as the public page shows them: province, city, manual order, name. */
    async list(options: { activeOnly?: boolean } = {}): Promise<PointOfSale[]> {
      const rows = (await sql.query(
        `SELECT ${COLUMNS} FROM points_of_sale WHERE ($1::boolean IS NOT TRUE OR active)
         ORDER BY province, city, sort_order, name`,
        [options.activeOnly ?? false],
      )) as PointRow[];
      return rows.map(toPoint);
    },

    async get(id: string): Promise<PointOfSale | null> {
      if (!UUID.test(id)) return null;
      const [row] = (await sql.query(`SELECT ${COLUMNS} FROM points_of_sale WHERE id = $1`, [id])) as PointRow[];
      return row ? toPoint(row) : null;
    },

    async create(actor: Actor, input: PointInput): Promise<string> {
      const [row] = (await sql.query(
        `WITH created AS (
           INSERT INTO points_of_sale (name, kind, address, city, province, latitude, longitude, hours, phone, instagram,
                                       notes, active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id
         ),
         logged AS (${audit} SELECT $14, $15, 'point.create', 'point', id::text, $16::jsonb FROM created)
         SELECT id FROM created`,
        [...params(input), actor.authUserId, actor.email, JSON.stringify(input)],
      )) as { id: string }[];
      return row.id;
    },

    async update(actor: Actor, id: string, input: PointInput): Promise<void> {
      if (!UUID.test(id)) throw new PointError("El punto de venta no existe.");
      const rows = (await sql.query(
        `WITH updated AS (
           UPDATE points_of_sale SET name = $1, kind = $2, address = $3, city = $4, province = $5, latitude = $6,
                  longitude = $7, hours = $8, phone = $9, instagram = $10, notes = $11, active = $12, sort_order = $13,
                  updated_at = now()
           WHERE id = $14 RETURNING id
         ),
         logged AS (${audit} SELECT $15, $16, 'point.update', 'point', id::text, $17::jsonb FROM updated)
         SELECT id FROM updated`,
        [...params(input), id, actor.authUserId, actor.email, JSON.stringify(input)],
      )) as { id: string }[];
      if (!rows.length) throw new PointError("El punto de venta no existe.");
    },

    async remove(actor: Actor, id: string): Promise<void> {
      if (!UUID.test(id)) throw new PointError("El punto de venta no existe.");
      await sql.query(
        `WITH removed AS (DELETE FROM points_of_sale WHERE id = $1 RETURNING id, name)
         ${audit} SELECT $2, $3, 'point.delete', 'point', id::text, jsonb_build_object('name', name) FROM removed`,
        [id, actor.authUserId, actor.email],
      );
    },
  };
}

export type PointRepository = ReturnType<typeof createPointRepository>;
