import { createCategoryRepository } from "../admin/categories-repository.ts";
import { createImageRepository, type AdminImage } from "../admin/images-repository.ts";
import { parseProductSearch, type ProductSearch } from "../admin/product-search.ts";
import { AdminDataError, createAdminRepository, productChanges, type AdminProduct } from "../admin/repository.ts";
import { parseProductCreate, parseProductUpdate, parseStockCount, type ProductUpdateInput } from "../admin/validation.ts";
import type { QueryFn } from "../customers/repository.ts";
import { createApiKeyRepository, hashRequest, integrationActor, RATE_LIMIT, type ApiKey, type ApiScope } from "./keys.ts";
import { OPENAPI_SPEC } from "./openapi.ts";
import { applyPriceRule, type PriceRule, type Rounding } from "./prices.ts";

/**
 * /api/admin/v1 — Sublime's standard admin API for integrations (n8n, scripts,
 * ERPs). Framework-independent: takes a Request, returns a Response. It reuses
 * the validation and repositories of the admin panel, so the rules are the same.
 */

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_BATCH = 500;

export type ApiDeps = {
  sql: QueryFn;
  /** False where the database is off (production today): every call gets 503. */
  available: boolean;
  /** Called after any write so the store stops serving the old catalog. */
  onCatalogChange?: () => void;
};

type Result = { status: number; body: unknown };
type FieldError = { path: string; message: string };

const NO_STORE = { "Cache-Control": "no-store" };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const error = (status: number, code: string, message: string, fields?: FieldError[]): Result => ({
  status,
  body: fields ? { error: code, message, fields } : { error: code, message },
});
const validation = (fields: FieldError[]) => error(422, "validation_failed", "Revisá los datos enviados.", fields);

class ApiError extends Error {
  readonly result: Result;

  constructor(result: Result) {
    super(String((result.body as { message?: string }).message));
    this.result = result;
  }
}

const fieldsFrom = (errors: Record<string, string | undefined>, prefix = ""): FieldError[] =>
  Object.entries(errors)
    .filter(([, message]) => message)
    .map(([key, message]) => ({ path: `${prefix}${key === "price" ? "priceMinor" : key}`, message: message as string }));

function fromDataError(cause: unknown): Result {
  if (cause instanceof ApiError) return cause.result;
  if (cause instanceof AdminDataError) {
    if (cause.code === "not_found") return error(404, "not_found", cause.message);
    if (cause.code === "conflict") return error(409, "conflict", cause.message);
    return error(422, "validation_failed", cause.message);
  }
  throw cause;
}

// ---------------------------------------------------------------- resources

function toApiProduct(product: AdminProduct, images?: AdminImage[]) {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    theme: product.theme,
    tags: product.tags,
    details: product.details,
    featured: product.featured,
    catalogCode: product.catalogCode,
    requiresQuote: product.requiresQuote,
    status: product.status,
    priceMinor: product.priceMinor,
    currency: "ARS",
    stock: product.trackStock
      ? { tracked: true, onHand: product.onHand, reserved: product.reserved, available: Math.max(0, product.onHand - product.reserved) }
      : { tracked: false },
    coverUrl: product.coverUrl,
    ...(images ? { images: images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, position: image.position })) } : {}),
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** Editable fields as the update validator expects them. */
const updateInputOf = (product: AdminProduct): ProductUpdateInput => ({
  name: product.name,
  slug: product.slug,
  description: product.description,
  categoryId: product.categoryId,
  theme: product.theme,
  tags: product.tags,
  details: product.details,
  featured: product.featured,
  catalogCode: product.catalogCode,
  status: product.status,
  priceMinor: product.priceMinor,
});

const UPDATE_FIELDS = ["name", "slug", "description", "categoryId", "theme", "tags", "details", "featured", "catalogCode", "status", "priceMinor"];
const CREATE_FIELDS = [...UPDATE_FIELDS, "sku", "requiresQuote", "initialStock"];

function assertObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(validation([{ path, message: "Se espera un objeto." }]));
  return value as Record<string, unknown>;
}

/** Strict contract: unknown fields are rejected, never silently ignored. */
function assertKnownFields(data: Record<string, unknown>, allowed: readonly string[], prefix = "") {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError(validation(unknown.map((key) => ({ path: `${prefix}${key}`, message: "Campo no admitido." }))));
}

function assertBatch(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || !value.length) throw new ApiError(validation([{ path, message: "Se espera una lista con al menos un elemento." }]));
  if (value.length > MAX_BATCH) throw new ApiError(error(413, "payload_too_large", `Hasta ${MAX_BATCH} elementos por pedido.`));
  return value;
}

/** Checked before writing so a dry run reports it too (the database also enforces it). */
async function assertCategory(repos: ReturnType<typeof repositories>, categoryId: unknown, path: string) {
  if (categoryId === undefined) return;
  try {
    await repos.categories.getCategory(String(categoryId));
  } catch (cause) {
    if (cause instanceof AdminDataError) throw new ApiError(validation([{ path, message: "La categoría no existe." }]));
    throw cause;
  }
}

const dryRunOf = (body: Record<string, unknown>) => {
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") throw new ApiError(validation([{ path: "dryRun", message: "Debe ser true o false." }]));
  return body.dryRun === true;
};

// ---------------------------------------------------------------- list query

const API_STOCK = { in: "con", low: "bajo", out: "sin", made_to_order: "pedido" } as const;
const API_IMAGES = { with: "con", without: "sin" } as const;
const API_SORT = {
  store: "orden",
  name: "nombre",
  price_asc: "precio-asc",
  price_desc: "precio-desc",
  stock_asc: "stock-asc",
  updated: "modificado",
} as const;

function parseListQuery(url: URL): ProductSearch {
  const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;
  const fields: FieldError[] = [];
  const known = ["q", "status", "categoryId", "theme", "stock", "images", "featured", "sort", "page", "pageSize", "updatedSince"];
  for (const key of url.searchParams.keys()) if (!known.includes(key)) fields.push({ path: key, message: "Parámetro no admitido." });

  const pick = <T extends Record<string, string>>(key: string, map: T) => {
    const value = get(key);
    if (value === undefined) return undefined;
    if (!(value in map)) fields.push({ path: key, message: `Valores posibles: ${Object.keys(map).join(", ")}.` });
    return map[value as keyof T];
  };
  const stock = pick("stock", API_STOCK);
  const images = pick("images", API_IMAGES);
  const sort = pick("sort", API_SORT) ?? "orden";
  const featured = pick("featured", { true: "si", false: "no" } as const);

  const status = get("status");
  if (status && !["draft", "active", "archived"].includes(status)) fields.push({ path: "status", message: "Valores posibles: draft, active, archived." });

  const page = Number(get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1) fields.push({ path: "page", message: "Entero desde 1." });
  const pageSize = Number(get("pageSize") ?? "50");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) fields.push({ path: "pageSize", message: "Entero entre 1 y 200." });

  const since = get("updatedSince");
  const updatedSince = since ? new Date(since) : undefined;
  if (updatedSince && Number.isNaN(updatedSince.getTime())) fields.push({ path: "updatedSince", message: "Fecha ISO 8601 (ej.: 2026-10-23T00:00:00Z)." });

  if (fields.length) throw new ApiError(validation(fields));
  // Reuse the admin parser for the shared rules (lengths, id formats).
  const base = parseProductSearch({ q: get("q"), estado: status, categoria: get("categoryId"), tematica: get("theme") });
  return { ...base, stock, images, featured, sort, page, pageSize, updatedSince };
}

// ---------------------------------------------------------------- router

type Handler = (ctx: Ctx) => Promise<Result>;
type Route = { method: string; pattern: RegExp; scope: ApiScope; run: Handler };

type Ctx = {
  key: ApiKey;
  match: RegExpMatchArray;
  url: URL;
  body: Record<string, unknown>;
  deps: ApiDeps;
  repos: ReturnType<typeof repositories>;
};

const repositories = (sql: QueryFn) => ({
  products: createAdminRepository(sql),
  categories: createCategoryRepository(sql),
  images: createImageRepository(sql),
});

const SKU = "([A-Z0-9][A-Z0-9-]{1,39})";

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^products$/,
    scope: "catalog:read",
    run: async ({ url, repos }) => {
      const result = await repos.products.searchProducts(parseListQuery(url));
      return {
        status: 200,
        body: { items: result.items.map((product) => toApiProduct(product)), page: result.page, pageSize: result.pageSize, total: result.total, pages: result.pages },
      };
    },
  },
  {
    method: "GET",
    pattern: new RegExp(`^products/${SKU}$`),
    scope: "catalog:read",
    run: async ({ match, repos }) => {
      const product = await repos.products.getProductBySku(match[1]);
      return { status: 200, body: toApiProduct(product, await repos.images.listImages(product.id)) };
    },
  },
  {
    method: "GET",
    pattern: /^categories$/,
    scope: "catalog:read",
    run: async ({ repos }) => ({
      status: 200,
      body: {
        items: (await repos.categories.listCategories()).map((category) => ({
          id: category.id,
          label: category.label,
          tagline: category.tagline,
          description: category.description,
          sortOrder: category.sortOrder,
          active: category.active,
          imageUrl: category.imageUrl || null,
          productCount: category.productCount,
        })),
      },
    }),
  },
  {
    method: "POST",
    pattern: /^products$/,
    scope: "catalog:write",
    run: async ({ body, key, repos }) => {
      assertKnownFields(body, CREATE_FIELDS);
      await assertCategory(repos, body.categoryId, "categoryId");
      const parsed = parseProductCreate(body);
      if (!parsed.ok) return validation(fieldsFrom(parsed.errors));
      const product = await repos.products.createProduct(integrationActor(key), parsed.value);
      return { status: 201, body: toApiProduct(product) };
    },
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^products/${SKU}$`),
    scope: "catalog:write",
    run: async ({ body, key, match, repos }) => {
      assertKnownFields(body, UPDATE_FIELDS);
      await assertCategory(repos, body.categoryId, "categoryId");
      const current = await repos.products.getProductBySku(match[1]);
      const parsed = parseProductUpdate({ ...updateInputOf(current), ...body }, current.requiresQuote);
      if (!parsed.ok) return validation(fieldsFrom(parsed.errors));
      return { status: 200, body: toApiProduct(await repos.products.updateProduct(integrationActor(key), current.id, parsed.value)) };
    },
  },
  {
    method: "POST",
    pattern: new RegExp(`^products/${SKU}/archive$`),
    scope: "catalog:write",
    run: async ({ body, key, match, repos }) => {
      assertKnownFields(body, []);
      const current = await repos.products.getProductBySku(match[1]);
      const archived = await repos.products.updateProduct(integrationActor(key), current.id, { ...updateInputOf(current), status: "archived" });
      return { status: 200, body: toApiProduct(archived) };
    },
  },
  {
    method: "POST",
    pattern: /^products\/bulk-upsert$/,
    scope: "catalog:write",
    run: async ({ body, key, repos }) => {
      assertKnownFields(body, ["items", "dryRun"]);
      const dryRun = dryRunOf(body);
      const items = assertBatch(body.items, "items");
      return batch(dryRun, items, async (raw, index) => {
        const item = assertObject(raw, `items[${index}]`);
        assertKnownFields(item, CREATE_FIELDS, `items[${index}].`);
        if (typeof item.sku !== "string" || !item.sku) throw new ApiError(validation([{ path: `items[${index}].sku`, message: "Cada ítem necesita su sku." }]));
        const sku = item.sku.toUpperCase();
        await assertCategory(repos, item.categoryId, `items[${index}].categoryId`);
        const current = await repos.products.getProductBySku(sku).catch((cause) => {
          if (cause instanceof AdminDataError && cause.code === "not_found") return null;
          throw cause;
        });
        if (!current) {
          const parsed = parseProductCreate(item);
          if (!parsed.ok) throw new ApiError(validation(fieldsFrom(parsed.errors, `items[${index}].`)));
          if (!dryRun) await repos.products.createProduct(integrationActor(key), parsed.value);
          return { sku, result: "created" };
        }
        if (item.requiresQuote !== undefined || item.initialStock !== undefined) {
          throw new ApiError(validation([{ path: `items[${index}]`, message: "requiresQuote e initialStock solo se usan al crear; para stock usá /stock/bulk-count." }]));
        }
        const patch = { ...item };
        delete patch.sku;
        const parsed = parseProductUpdate({ ...updateInputOf(current), ...patch }, current.requiresQuote);
        if (!parsed.ok) throw new ApiError(validation(fieldsFrom(parsed.errors, `items[${index}].`)));
        const changes = Object.keys(productChanges(current, { ...parsed.value, priceMinor: current.requiresQuote ? null : parsed.value.priceMinor }));
        if (!changes.length) return { sku, result: "unchanged" };
        if (!dryRun) await repos.products.updateProduct(integrationActor(key), current.id, parsed.value);
        return { sku, result: "updated", changes };
      });
    },
  },
  {
    method: "POST",
    pattern: /^products\/bulk-archive$/,
    scope: "catalog:write",
    run: async ({ body, key, repos }) => {
      assertKnownFields(body, ["skus", "dryRun"]);
      const dryRun = dryRunOf(body);
      return batch(dryRun, assertBatch(body.skus, "skus"), async (raw) => {
        const sku = String(raw).toUpperCase();
        const current = await repos.products.getProductBySku(sku);
        if (current.status === "archived") return { sku, result: "unchanged" };
        if (!dryRun) await repos.products.updateProduct(integrationActor(key), current.id, { ...updateInputOf(current), status: "archived" });
        return { sku, result: "updated", changes: ["status"] };
      });
    },
  },
  {
    method: "POST",
    pattern: /^prices\/bulk-update$/,
    scope: "prices:write",
    run: async ({ body, key, repos }) => {
      assertKnownFields(body, ["items", "rule", "scope", "rounding", "dryRun"]);
      const dryRun = dryRunOf(body);
      const actor = integrationActor(key);
      const setPrice = async (current: AdminProduct, priceMinor: number) => {
        if (current.requiresQuote) throw new ApiError(validation([{ path: "sku", message: "Producto a pedido: no lleva precio." }]));
        const parsed = parseProductUpdate({ ...updateInputOf(current), priceMinor }, false);
        if (!parsed.ok) throw new ApiError(validation(fieldsFrom(parsed.errors)));
        if (current.priceMinor === priceMinor) return { sku: current.sku, result: "unchanged" };
        if (!dryRun) await repos.products.updateProduct(actor, current.id, parsed.value);
        return { sku: current.sku, result: "updated", changes: ["priceMinor"], before: current.priceMinor, after: priceMinor };
      };

      if (body.items !== undefined) {
        if (body.rule !== undefined || body.scope !== undefined) {
          return validation([{ path: "items", message: "Usá items (precio exacto) o rule + scope (ajuste), no ambos." }]);
        }
        return batch(dryRun, assertBatch(body.items, "items"), async (raw, index) => {
          const item = assertObject(raw, `items[${index}]`);
          assertKnownFields(item, ["sku", "priceMinor"], `items[${index}].`);
          return setPrice(await repos.products.getProductBySku(String(item.sku ?? "").toUpperCase()), item.priceMinor as number);
        });
      }

      const rule = parseRule(body.rule);
      const rounding = (body.rounding ?? "none") as Rounding;
      if (!["none", "nearest_100", "nearest_1000"].includes(rounding)) {
        return validation([{ path: "rounding", message: "Valores posibles: none, nearest_100, nearest_1000." }]);
      }
      const targets = await scopedProducts(body.scope, repos);
      return batch(dryRun, targets, async (current) => {
        const product = current as AdminProduct;
        if (product.requiresQuote || product.priceMinor === null) return { sku: product.sku, result: "skipped", reason: "Producto a pedido." };
        const next = applyPriceRule(product.priceMinor, rule, rounding);
        if (next === null) throw new ApiError(validation([{ path: "rule", message: "El precio resultante quedaría en $ 0 o menos, o supera el máximo." }]));
        return setPrice(product, next);
      });
    },
  },
  {
    method: "POST",
    pattern: /^stock\/bulk-count$/,
    scope: "stock:write",
    run: async ({ body, key, repos }) => {
      assertKnownFields(body, ["items", "dryRun"]);
      const dryRun = dryRunOf(body);
      return batch(dryRun, assertBatch(body.items, "items"), async (raw, index) => {
        const item = assertObject(raw, `items[${index}]`);
        assertKnownFields(item, ["sku", "onHand", "reason", "note"], `items[${index}].`);
        const parsed = parseStockCount({ onHand: String(item.onHand ?? ""), reason: item.reason, note: item.note ?? "" });
        if (!parsed.ok) throw new ApiError(validation(fieldsFrom(parsed.errors, `items[${index}].`)));
        const current = await repos.products.getProductBySku(String(item.sku ?? "").toUpperCase());
        if (!current.trackStock) throw new ApiError(validation([{ path: `items[${index}].sku`, message: "Producto a pedido: no lleva stock." }]));
        if (parsed.value.onHand < current.reserved) {
          throw new ApiError(validation([{ path: `items[${index}].onHand`, message: `Hay ${current.reserved} unidades reservadas: el stock no puede ser menor.` }]));
        }
        if (parsed.value.onHand === current.onHand) return { sku: current.sku, result: "unchanged" };
        if (!dryRun) await repos.products.countStock(integrationActor(key), current.id, parsed.value);
        return { sku: current.sku, result: "updated", changes: ["onHand"], before: current.onHand, after: parsed.value.onHand };
      });
    },
  },
];

function parseRule(value: unknown): PriceRule {
  const rule = assertObject(value, "rule");
  assertKnownFields(rule, ["type", "value"], "rule.");
  const amount = rule.value;
  if (rule.type === "percent" && typeof amount === "number" && Number.isFinite(amount) && amount > -100 && amount <= 1000) {
    return { type: "percent", value: amount };
  }
  if (rule.type === "amount" && Number.isInteger(amount) && Math.abs(amount as number) <= 100_000_000) {
    return { type: "amount", value: amount as number };
  }
  throw new ApiError(
    validation([{ path: "rule", message: 'Usá { "type": "percent", "value": 12.5 } (entre -100 y 1000) o { "type": "amount", "value": 50000 } (centavos enteros).' }]),
  );
}

/** Products a price rule applies to: a category, a list of SKUs or the whole catalog. */
async function scopedProducts(value: unknown, repos: ReturnType<typeof repositories>): Promise<AdminProduct[]> {
  const scope = assertObject(value, "scope");
  assertKnownFields(scope, ["categoryId", "skus", "all"], "scope.");
  const chosen = ["categoryId", "skus", "all"].filter((key) => scope[key] !== undefined);
  if (chosen.length !== 1) throw new ApiError(validation([{ path: "scope", message: "Indicá uno: categoryId, skus o all: true." }]));
  if (scope.skus !== undefined) {
    return Promise.all(assertBatch(scope.skus, "scope.skus").map((sku) => repos.products.getProductBySku(String(sku).toUpperCase())));
  }
  if (scope.all !== undefined && scope.all !== true) throw new ApiError(validation([{ path: "scope.all", message: "Debe ser true." }]));
  const search = parseProductSearch({ categoria: scope.categoryId === undefined ? undefined : String(scope.categoryId) });
  if (scope.categoryId !== undefined && !search.categoryId) throw new ApiError(validation([{ path: "scope.categoryId", message: "Categoría inválida." }]));
  const items: AdminProduct[] = [];
  for (let page = 1; ; page++) {
    const result = await repos.products.searchProducts({ ...search, page, pageSize: 200 });
    items.push(...result.items);
    if (page >= result.pages) break;
  }
  if (items.length > MAX_BATCH * 10) throw new ApiError(error(413, "payload_too_large", "Demasiados productos para un ajuste en un solo pedido."));
  return items;
}

/** Applies each item on its own: one invalid item never stops the others. */
async function batch(dryRun: boolean, items: unknown[], run: (item: unknown, index: number) => Promise<Record<string, unknown>>): Promise<Result> {
  const results: Record<string, unknown>[] = [];
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  for (const [index, item] of items.entries()) {
    try {
      const outcome = await run(item, index);
      summary[outcome.result as keyof typeof summary] += 1;
      results.push({ index, ...outcome });
    } catch (cause) {
      const failure = fromDataError(cause);
      summary.failed += 1;
      results.push({ index, ...(typeof item === "string" ? { sku: item } : {}), result: "failed", error: failure.body });
    }
  }
  return { status: 200, body: { dryRun, summary, items: results } };
}

// ---------------------------------------------------------------- entry point

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(error(415, "unsupported_media_type", "Enviá el cuerpo como application/json."));
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    throw new ApiError(error(413, "payload_too_large", "El cuerpo supera 1 MB."));
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new ApiError(error(413, "payload_too_large", "El cuerpo supera 1 MB."));
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(error(400, "bad_request", "El cuerpo no es JSON válido."));
  }
  return assertObject(parsed, "body");
}

export async function handleAdminApi(request: Request, path: string[], deps: ApiDeps): Promise<Response> {
  const route = path.join("/");
  if (request.method === "GET" && route === "openapi.json") return json(200, OPENAPI_SPEC);
  if (!deps.available) return json(503, { error: "not_available", message: "La API de administración no está habilitada en este entorno." });

  const keys = createApiKeyRepository(deps.sql);
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const key = token ? await keys.authenticate(token) : null;
  if (!key) return json(401, { error: "unauthorized", message: "Falta la clave de API o es inválida." }, { "WWW-Authenticate": "Bearer" });

  const requests = await keys.hit(key.id);
  const rateHeaders = { "X-RateLimit-Limit": String(RATE_LIMIT), "X-RateLimit-Remaining": String(Math.max(0, RATE_LIMIT - requests)) };
  if (requests > RATE_LIMIT) {
    const retryAfter = String(60 - new Date().getUTCSeconds());
    return json(429, { error: "rate_limited", message: `Superaste ${RATE_LIMIT} pedidos por minuto.` }, { ...rateHeaders, "Retry-After": retryAfter });
  }

  const sameRoute = routes.filter((candidate) => candidate.pattern.test(route));
  const handler = sameRoute.find((candidate) => candidate.method === request.method);
  if (!handler) {
    return sameRoute.length
      ? json(405, { error: "method_not_allowed", message: "Método no admitido para este recurso." }, { ...rateHeaders, Allow: sameRoute.map((r) => r.method).join(", ") })
      : json(404, { error: "not_found", message: "El recurso no existe." }, rateHeaders);
  }
  if (!key.scopes.includes(handler.scope)) {
    return json(403, { error: "forbidden", message: `La clave no tiene el permiso ${handler.scope}.` }, rateHeaders);
  }

  const isWrite = request.method !== "GET";
  let body: Record<string, unknown> = {};
  let idempotency: { key: string; hash: string } | null = null;
  try {
    if (isWrite) {
      body = await readBody(request);
      const idempotencyKey = request.headers.get("idempotency-key");
      if (idempotencyKey !== null) {
        if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
          return json(422, { error: "validation_failed", message: "Idempotency-Key debe tener entre 8 y 120 caracteres." }, rateHeaders);
        }
        const hash = hashRequest(`${request.method} ${route} ${JSON.stringify(body)}`);
        const previous = await keys.findIdempotent(key.id, idempotencyKey);
        if (previous && previous.requestHash !== hash) {
          return json(409, { error: "conflict", message: "Esa Idempotency-Key ya se usó con otro pedido." }, rateHeaders);
        }
        if (previous) return json(previous.status, previous.body, { ...rateHeaders, "Idempotent-Replayed": "true" });
        idempotency = { key: idempotencyKey, hash };
      }
    }
  } catch (cause) {
    const failure = fromDataError(cause);
    return json(failure.status, failure.body, rateHeaders);
  }

  let result: Result;
  try {
    result = await handler.run({ key, match: route.match(handler.pattern)!, url: new URL(request.url), body, deps, repos: repositories(deps.sql) });
  } catch (cause) {
    result = fromDataError(cause);
  }

  const wroteSomething = isWrite && result.status < 300 && !(result.body as { dryRun?: boolean }).dryRun;
  if (wroteSomething) deps.onCatalogChange?.();
  if (idempotency && result.status < 500) await keys.saveIdempotent(key.id, idempotency.key, idempotency.hash, result.status, result.body);
  return json(result.status, result.body, rateHeaders);
}
