/**
 * OpenAPI 3.1 description of /api/admin/v1, served at /api/admin/v1/openapi.json.
 * This file is the contract: integrations (n8n, scripts, ERPs) adapt to it.
 * Keep it in sync with handler.ts; tests check that every route is described.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });
const jsonBody = (schema: object, required = true) => ({ required, content: { "application/json": { schema } } });
const ok = (description: string, schema: object) => ({ description, content: { "application/json": { schema } } });

const commonErrors = {
  "401": errorResponse("Falta la clave de API o es inválida/revocada."),
  "403": errorResponse("La clave no tiene el permiso requerido."),
  "429": errorResponse("Más de 120 pedidos por minuto. Ver Retry-After."),
  "503": errorResponse("API no habilitada en este entorno."),
};
const writeErrors = {
  ...commonErrors,
  "400": errorResponse("JSON inválido."),
  "409": errorResponse("Conflicto (slug, SKU o código duplicado; Idempotency-Key reutilizada con otro cuerpo)."),
  "413": errorResponse("Cuerpo mayor a 1 MB o más de 500 ítems."),
  "415": errorResponse("El cuerpo no es application/json."),
  "422": errorResponse("Datos inválidos: ver fields."),
};

const sku = { name: "sku", in: "path", required: true, schema: { type: "string", pattern: "^[A-Z0-9][A-Z0-9-]{1,39}$" } };
const idempotencyKey = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "8 a 120 caracteres. Reenviar la misma clave con el mismo cuerpo devuelve la respuesta original (24 h) sin aplicar nada de nuevo.",
  schema: { type: "string", minLength: 8, maxLength: 120 },
};
const dryRun = { type: "boolean", default: false, description: "true = valida y devuelve el resultado sin guardar." };

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Sublime · API de administración",
    version: "1.0.0",
    description:
      "Estándar de Sublime para integraciones (n8n, scripts, ERPs). Autenticación con `Authorization: Bearer <api-key>` " +
      "(claves por integración, con permisos). Importes en centavos enteros (`priceMinor`, ARS). Los productos se identifican por `sku`. " +
      "Las bajas archivan, nunca borran. Todo cambio queda auditado como `integration:<nombre>`.",
  },
  servers: [{ url: "/api/admin/v1" }],
  security: [{ apiKey: [] }],
  paths: {
    "/products": {
      get: {
        summary: "Listar productos",
        description: "Permiso: catalog:read. Paginado por página.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 60 }, description: "Nombre, SKU, código de catálogo o etiqueta." },
          { name: "status", in: "query", schema: { enum: ["draft", "active", "archived"] } },
          { name: "categoryId", in: "query", schema: { type: "string" } },
          { name: "theme", in: "query", schema: { type: "string" } },
          { name: "stock", in: "query", schema: { enum: ["in", "low", "out", "made_to_order"] } },
          { name: "images", in: "query", schema: { enum: ["with", "without"] } },
          { name: "featured", in: "query", schema: { enum: ["true", "false"] } },
          { name: "sort", in: "query", schema: { enum: ["store", "name", "price_asc", "price_desc", "stock_asc", "updated"], default: "store" } },
          { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" }, description: "Sincronización incremental: cambios de producto, precio o stock desde esa fecha." },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: {
          "200": ok("Página de productos", {
            type: "object",
            properties: { items: { type: "array", items: ref("Product") }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, pages: { type: "integer" } },
          }),
          "422": errorResponse("Parámetros inválidos."),
          ...commonErrors,
        },
      },
      post: {
        summary: "Crear producto",
        description: "Permiso: catalog:write. Nace en draft salvo que se indique status.",
        parameters: [idempotencyKey],
        requestBody: jsonBody(ref("ProductCreate")),
        responses: { "201": ok("Producto creado", ref("Product")), ...writeErrors },
      },
    },
    "/products/{sku}": {
      get: {
        summary: "Obtener un producto (con imágenes)",
        description: "Permiso: catalog:read.",
        parameters: [sku],
        responses: { "200": ok("Producto", ref("Product")), "404": errorResponse("No existe."), ...commonErrors },
      },
      patch: {
        summary: "Modificar un producto",
        description: "Permiso: catalog:write. Solo cambian los campos enviados.",
        parameters: [sku, idempotencyKey],
        requestBody: jsonBody(ref("ProductUpdate")),
        responses: { "200": ok("Producto actualizado", ref("Product")), "404": errorResponse("No existe."), ...writeErrors },
      },
    },
    "/products/{sku}/archive": {
      post: {
        summary: "Archivar (baja lógica)",
        description: "Permiso: catalog:write.",
        parameters: [sku, idempotencyKey],
        responses: { "200": ok("Producto archivado", ref("Product")), "404": errorResponse("No existe."), ...writeErrors },
      },
    },
    "/products/bulk-upsert": {
      post: {
        summary: "Alta o modificación masiva por SKU",
        description: "Permiso: catalog:write. Si el sku existe actualiza los campos enviados; si no, lo crea. Cada ítem se aplica por separado.",
        parameters: [idempotencyKey],
        requestBody: jsonBody({
          type: "object",
          required: ["items"],
          additionalProperties: false,
          properties: { items: { type: "array", minItems: 1, maxItems: 500, items: ref("ProductCreate") }, dryRun },
        }),
        responses: { "200": ok("Resultado por ítem", ref("BatchResult")), ...writeErrors },
      },
    },
    "/products/bulk-archive": {
      post: {
        summary: "Baja masiva",
        description: "Permiso: catalog:write.",
        parameters: [idempotencyKey],
        requestBody: jsonBody({
          type: "object",
          required: ["skus"],
          additionalProperties: false,
          properties: { skus: { type: "array", minItems: 1, maxItems: 500, items: { type: "string" } }, dryRun },
        }),
        responses: { "200": ok("Resultado por ítem", ref("BatchResult")), ...writeErrors },
      },
    },
    "/prices/bulk-update": {
      post: {
        summary: "Actualización masiva de precios",
        description:
          "Permiso: prices:write. Dos formas: `items` con precio exacto por SKU, o `rule` + `scope` (+ `rounding`) para un ajuste " +
          "porcentual o por monto. Nunca deja precios en $ 0 o menos; los productos a pedido se omiten.",
        parameters: [idempotencyKey],
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              minItems: 1,
              maxItems: 500,
              items: { type: "object", required: ["sku", "priceMinor"], additionalProperties: false, properties: { sku: { type: "string" }, priceMinor: { type: "integer", minimum: 1 } } },
            },
            rule: {
              oneOf: [
                { type: "object", required: ["type", "value"], properties: { type: { const: "percent" }, value: { type: "number", exclusiveMinimum: -100, maximum: 1000 } } },
                { type: "object", required: ["type", "value"], properties: { type: { const: "amount" }, value: { type: "integer", description: "Centavos, positivo o negativo." } } },
              ],
            },
            scope: {
              oneOf: [
                { type: "object", required: ["categoryId"], properties: { categoryId: { type: "string" } } },
                { type: "object", required: ["skus"], properties: { skus: { type: "array", items: { type: "string" }, maxItems: 500 } } },
                { type: "object", required: ["all"], properties: { all: { const: true } } },
              ],
            },
            rounding: { enum: ["none", "nearest_100", "nearest_1000"], default: "none", description: "nearest_100 = a $1; nearest_1000 = a $10." },
            dryRun,
          },
        }),
        responses: { "200": ok("Resultado por ítem (con before/after)", ref("BatchResult")), ...writeErrors },
      },
    },
    "/stock/bulk-count": {
      post: {
        summary: "Conteos de stock masivos",
        description: "Permiso: stock:write. onHand = unidades contadas; se registra la diferencia como movimiento. No puede quedar por debajo de lo reservado.",
        parameters: [idempotencyKey],
        requestBody: jsonBody({
          type: "object",
          required: ["items"],
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              minItems: 1,
              maxItems: 500,
              items: {
                type: "object",
                required: ["sku", "onHand", "reason"],
                additionalProperties: false,
                properties: {
                  sku: { type: "string" },
                  onHand: { type: "integer", minimum: 0, maximum: 100000 },
                  reason: { enum: ["restock", "adjustment"] },
                  note: { type: "string", maxLength: 200, description: "Obligatoria si reason = adjustment." },
                },
              },
            },
            dryRun,
          },
        }),
        responses: { "200": ok("Resultado por ítem (con before/after)", ref("BatchResult")), ...writeErrors },
      },
    },
    "/categories": {
      get: {
        summary: "Listar categorías (incluye ocultas)",
        description: "Permiso: catalog:read.",
        responses: { "200": ok("Categorías", { type: "object", properties: { items: { type: "array", items: ref("Category") } } }), ...commonErrors },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", description: "Clave de integración: sk_sublime_<prefijo>_<secreto>. Se crea en /admin/integraciones." },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error", "message"],
        properties: {
          error: { type: "string", examples: ["validation_failed"] },
          message: { type: "string" },
          fields: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id público (p13, c088, x1a2b3c4d)." },
          sku: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          categoryId: { type: "string" },
          theme: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          details: { type: "array", items: { type: "string" } },
          featured: { type: "boolean" },
          catalogCode: { type: ["string", "null"] },
          requiresQuote: { type: "boolean" },
          status: { enum: ["draft", "active", "archived"] },
          priceMinor: { type: ["integer", "null"], description: "Centavos. null = a pedido." },
          currency: { const: "ARS" },
          stock: {
            type: "object",
            properties: { tracked: { type: "boolean" }, onHand: { type: "integer" }, reserved: { type: "integer" }, available: { type: "integer" } },
          },
          coverUrl: { type: "string" },
          images: { type: "array", items: { type: "object", properties: { id: { type: "string" }, url: { type: "string" }, alt: { type: "string" }, position: { type: "integer" } } } },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ProductUpdate: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          slug: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 80 },
          description: { type: "string", maxLength: 2000 },
          categoryId: { type: "string" },
          theme: { type: "string" },
          tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 30 } },
          details: { type: "array", maxItems: 12, items: { type: "string", maxLength: 200 } },
          featured: { type: "boolean" },
          catalogCode: { type: ["string", "null"], pattern: "^[0-9]{3,6}$" },
          status: { enum: ["draft", "active", "archived"] },
          priceMinor: { type: ["integer", "null"], minimum: 1, maximum: 1000000000 },
        },
      },
      ProductCreate: {
        allOf: [
          ref("ProductUpdate"),
          {
            type: "object",
            required: ["name", "categoryId", "theme"],
            properties: {
              sku: { type: "string", pattern: "^[A-Z0-9][A-Z0-9-]{1,39}$", description: "Opcional al crear (se genera SUB-<ID>); obligatorio en bulk-upsert." },
              requiresQuote: { type: "boolean", default: false, description: "true = a pedido: sin precio ni stock." },
              initialStock: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
            },
          },
        ],
      },
      BatchResult: {
        type: "object",
        properties: {
          dryRun: { type: "boolean" },
          summary: {
            type: "object",
            properties: { created: { type: "integer" }, updated: { type: "integer" }, unchanged: { type: "integer" }, skipped: { type: "integer" }, failed: { type: "integer" } },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                sku: { type: "string" },
                result: { enum: ["created", "updated", "unchanged", "skipped", "failed"] },
                changes: { type: "array", items: { type: "string" } },
                before: {},
                after: {},
                error: ref("Error"),
              },
            },
          },
        },
      },
      Category: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          tagline: { type: "string" },
          description: { type: "string" },
          sortOrder: { type: "integer" },
          active: { type: "boolean" },
          imageUrl: { type: ["string", "null"] },
          productCount: { type: "integer" },
        },
      },
    },
  },
} as const;
