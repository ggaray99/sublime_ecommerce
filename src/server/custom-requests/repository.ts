import { randomBytes } from "node:crypto";
import type { QueryFn } from "../customers/repository.ts";

export const REQUEST_STATUSES = ["received", "quoted", "accepted", "declined", "in_production", "delivered", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Requests per email per hour (anti-spam for the public form). */
export const MAX_REQUESTS_PER_HOUR = 5;

export type RequestFile = { id: string; originalName: string; contentType: string; sizeBytes: number; pathname: string };
export type RequestEvent = { fromStatus: string | null; toStatus: string; actor: string; note: string; createdAt: Date };

export type CustomRequest = {
  id: string;
  number: number;
  accessToken: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  productType: string;
  quantity: number;
  idea: string;
  reference: string;
  productSlug: string | null;
  status: RequestStatus;
  quoteMinor: number | null;
  depositMinor: number | null;
  quoteMessage: string;
  quoteValidUntil: string | null;
  quoteEtaDays: number | null;
  createdAt: Date;
};

export type CustomRequestDetail = CustomRequest & { files: RequestFile[]; events: RequestEvent[] };

export type NewCustomRequest = {
  idempotencyKey: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  productType: string;
  quantity: number;
  idea: string;
  reference: string;
  productSlug: string | null;
  file: { pathname: string; originalName: string; contentType: string; sizeBytes: number } | null;
  /** Custom Lab: what was designed and its server-validated settings. Default: the classic form. */
  kind?: RequestKind;
  config?: Record<string, unknown>;
  /** Custom Lab: every stored file with its role (original, preview, production). */
  files?: NewRequestFile[];
};

export type RequestKind = "free" | "sticker" | "tshirt";

export type NewRequestFile = {
  pathname: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  role: "reference" | "original" | "preview" | "production";
  width?: number | null;
  height?: number | null;
};

export type QuoteResponse = { quoteMinor: number; depositMinor: number | null; message: string; validUntil: string; etaDays: number | null };

export class CustomRequestError extends Error {
  readonly code: "not_found" | "invalid_transition" | "expired_quote";

  constructor(code: "not_found" | "invalid_transition" | "expired_quote", message: string) {
    super(message);
    this.code = code;
  }
}

type RequestRow = {
  id: string;
  number: string | number;
  access_token: string;
  customer_id: string | null;
  contact_name: string;
  contact_email: string;
  product_type: string;
  quantity: number;
  idea: string;
  reference: string;
  product_slug: string | null;
  status: RequestStatus;
  quote_minor: string | number | null;
  deposit_minor: string | number | null;
  quote_message: string;
  quote_valid_until: string | Date | null;
  quote_eta_days: number | null;
  created_at: Date;
};

const isoDate = (value: string | Date | null) =>
  value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);

const toRequest = (row: RequestRow): CustomRequest => ({
  id: row.id,
  number: Number(row.number),
  accessToken: row.access_token,
  customerId: row.customer_id,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  productType: row.product_type,
  quantity: row.quantity,
  idea: row.idea,
  reference: row.reference,
  productSlug: row.product_slug,
  status: row.status,
  quoteMinor: row.quote_minor === null ? null : Number(row.quote_minor),
  depositMinor: row.deposit_minor === null ? null : Number(row.deposit_minor),
  quoteMessage: row.quote_message,
  quoteValidUntil: isoDate(row.quote_valid_until),
  quoteEtaDays: row.quote_eta_days,
  createdAt: new Date(row.created_at),
});

/** Display number: ENC-5001. */
export const requestNumber = (request: Pick<CustomRequest, "number">) => `ENC-${request.number}`;

/** Today in Argentina (UTC−3, no DST), as YYYY-MM-DD. */
export const argentinaToday = (now = new Date()) => new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** The customer can still accept: quoted and not past its validity date. */
export const quoteIsOpen = (request: Pick<CustomRequest, "status" | "quoteValidUntil">, today = argentinaToday()) =>
  request.status === "quoted" && request.quoteValidUntil !== null && request.quoteValidUntil >= today;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCustomRequestRepository(sql: QueryFn) {
  async function get(id: string): Promise<CustomRequestDetail> {
    if (!UUID.test(id)) throw new CustomRequestError("not_found", "El encargo no existe.");
    const [row] = (await sql.query("SELECT * FROM custom_requests WHERE id = $1", [id])) as RequestRow[];
    if (!row) throw new CustomRequestError("not_found", "El encargo no existe.");
    const [files, events] = await Promise.all([
      sql.query("SELECT id, original_name, content_type, size_bytes, pathname FROM custom_request_files WHERE request_id = $1 ORDER BY created_at", [id]) as Promise<
        { id: string; original_name: string; content_type: string; size_bytes: number; pathname: string }[]
      >,
      sql.query("SELECT from_status, to_status, actor, note, created_at FROM custom_request_events WHERE request_id = $1 ORDER BY created_at, id", [id]) as Promise<
        { from_status: string | null; to_status: string; actor: string; note: string; created_at: Date }[]
      >,
    ]);
    return {
      ...toRequest(row),
      files: files.map((file) => ({ id: file.id, originalName: file.original_name, contentType: file.content_type, sizeBytes: file.size_bytes, pathname: file.pathname })),
      events: events.map((event) => ({
        fromStatus: event.from_status,
        toStatus: event.to_status,
        actor: event.actor,
        note: event.note,
        createdAt: new Date(event.created_at),
      })),
    };
  }

  /** Runs a status change with its history entry; fails if the request is not in an allowed status. */
  async function transition(id: string, from: RequestStatus[], to: RequestStatus, actor: string, note: string, set = "", params: unknown[] = []) {
    const current = await get(id);
    if (!from.includes(current.status)) {
      throw new CustomRequestError("invalid_transition", "Esta acción no corresponde al estado actual del encargo.");
    }
    const rows = (await sql.query(
      `WITH changed AS (
         UPDATE custom_requests SET status = $2, updated_at = now() ${set}
         WHERE id = $1 AND status = ANY($3::text[]) RETURNING id, $5::text AS previous
       )
       INSERT INTO custom_request_events (request_id, from_status, to_status, actor, note)
       SELECT id, previous, $2, $4, $6 FROM changed RETURNING request_id`,
      [id, to, from, actor, current.status, note, ...params],
    )) as { request_id: string }[];
    if (!rows.length) throw new CustomRequestError("invalid_transition", "El encargo cambió mientras tanto. Recargá la página.");
  }

  return {
    get,

    async getByToken(id: string, token: string): Promise<CustomRequestDetail | null> {
      const request = await get(id).catch(() => null);
      return request && token && request.accessToken === token ? request : null;
    },

    async findByIdempotencyKey(key: string): Promise<CustomRequest | null> {
      const [row] = (await sql.query("SELECT * FROM custom_requests WHERE idempotency_key = $1", [key])) as RequestRow[];
      return row ? toRequest(row) : null;
    },

    async recentCountByEmail(email: string): Promise<number> {
      const [row] = (await sql.query(
        "SELECT count(*)::int AS n FROM custom_requests WHERE lower(contact_email) = lower($1) AND created_at > now() - interval '1 hour'",
        [email],
      )) as { n: number }[];
      return row.n;
    },

    async list(filter: { status?: RequestStatus; customerId?: string; limit?: number } = {}): Promise<CustomRequest[]> {
      const rows = (await sql.query(
        `SELECT * FROM custom_requests
         WHERE ($1::text IS NULL OR status = $1) AND ($2::uuid IS NULL OR customer_id = $2)
         ORDER BY created_at DESC LIMIT $3`,
        [filter.status ?? null, filter.customerId ?? null, filter.limit ?? 100],
      )) as RequestRow[];
      return rows.map(toRequest);
    },

    async countByStatus(): Promise<Record<RequestStatus, number>> {
      const rows = (await sql.query("SELECT status, count(*)::int AS n FROM custom_requests GROUP BY status")) as { status: RequestStatus; n: number }[];
      return Object.fromEntries(REQUEST_STATUSES.map((status) => [status, rows.find((row) => row.status === status)?.n ?? 0])) as Record<RequestStatus, number>;
    },

    /** Request, optional reference file and first history entry in one statement. */
    async create(input: NewCustomRequest): Promise<CustomRequest> {
      const [row] = (await sql.query(
        `WITH created AS (
           INSERT INTO custom_requests (access_token, customer_id, contact_name, contact_email, product_type, quantity, idea,
                                        reference, product_slug, idempotency_key, kind, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13::jsonb)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *
         ),
         attached AS (
           INSERT INTO custom_request_files (request_id, pathname, original_name, content_type, size_bytes, role, width, height)
           SELECT created.id, f.pathname, f."originalName", f."contentType", f."sizeBytes", f.role, f.width, f.height
           FROM created, jsonb_to_recordset($11::jsonb) AS f(pathname text, "originalName" text, "contentType" text,
                                                             "sizeBytes" integer, role text, width integer, height integer)
         ),
         history AS (
           INSERT INTO custom_request_events (request_id, from_status, to_status, actor, note)
           SELECT id, NULL, 'received', 'cliente', 'Solicitud recibida.' FROM created
         ),
         -- Same statement as the request: a notice never announces something that was not saved.
         notice AS (
           INSERT INTO notification_outbox (kind, payload)
           SELECT 'request.created', jsonb_build_object('requestId', id, 'number', number, 'kind', kind) FROM created
         )
         SELECT * FROM created`,
        [
          randomBytes(24).toString("base64url"),
          input.customerId,
          input.contactName,
          input.contactEmail,
          input.productType,
          input.quantity,
          input.idea,
          input.reference,
          input.productSlug,
          input.idempotencyKey,
          JSON.stringify(input.files ?? (input.file ? [{ ...input.file, role: "reference" }] : [])),
          input.kind ?? "free",
          JSON.stringify(input.config ?? {}),
        ],
      )) as RequestRow[];
      if (row) return toRequest(row);
      // Same submit twice: return the first one.
      const existing = (await sql.query("SELECT * FROM custom_requests WHERE idempotency_key = $1", [input.idempotencyKey])) as RequestRow[];
      return toRequest(existing[0]);
    },

    /** Sends (or replaces) the quote. */
    async sendQuote(actor: string, id: string, quote: QuoteResponse) {
      await transition(
        id,
        ["received", "quoted"],
        "quoted",
        actor,
        quote.message || "Presupuesto enviado.",
        ", quote_minor = $7, deposit_minor = $8, quote_message = $9, quote_valid_until = $10::date, quote_eta_days = $11",
        [quote.quoteMinor, quote.depositMinor, quote.message, quote.validUntil, quote.etaDays],
      );
    },

    /** The customer accepts or declines an open quote. */
    async decide(id: string, decision: "accept" | "decline", actor: string, note = "") {
      const current = await get(id);
      if (current.status === "quoted" && !quoteIsOpen(current)) {
        throw new CustomRequestError("expired_quote", "El presupuesto venció. Escribinos y te mandamos uno actualizado.");
      }
      await transition(
        id,
        ["quoted"],
        decision === "accept" ? "accepted" : "declined",
        actor,
        note || (decision === "accept" ? "El cliente aceptó el presupuesto." : "El cliente rechazó el presupuesto."),
      );
    },

    async startProduction(actor: string, id: string, note: string) {
      await transition(id, ["accepted"], "in_production", actor, note || "En producción.");
    },

    async markDelivered(actor: string, id: string, note: string) {
      await transition(id, ["in_production"], "delivered", actor, note || "Encargo entregado.");
    },

    async cancel(actor: string, id: string, note: string) {
      await transition(id, ["received", "quoted", "accepted", "in_production"], "cancelled", actor, note);
    },
  };
}

export type CustomRequestRepository = ReturnType<typeof createCustomRequestRepository>;
