// Admin list selection: CSV export of the selected products, orders and custom
// requests, the shared CSV writer and the endpoint guard/validation (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { csvCell, formatCsv, pesosCell } from "../src/lib/csv.ts";
import { exportCatalog, toCsv } from "../src/server/admin/csv.ts";
import { exportSelection, MAX_EXPORT_IDS, parseSelectedIds, PRODUCT_ID, UUID_ID } from "../src/server/admin/selection-export.ts";
import { createCustomRequestRepository } from "../src/server/custom-requests/repository.ts";
import { exportOrdersCsv } from "../src/server/orders/export.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { exportRequestsCsv } from "../src/server/requests/export.ts";

const files = (folder) => readdirSync(join("db", folder)).filter((n) => n.endsWith(".sql")).sort().map((n) => readFileSync(join("db", folder, n), "utf8"));
const BOM = "\uFEFF";
const lines = (csv) => csv.replace(BOM, "").trimEnd().split("\r\n");

const orderLabels = { pending_payment: "Pendiente de pago", paid: "Pago confirmado", shipped: "Enviado", fulfilled: "Entregado", cancelled: "Cancelado", expired: "Vencido", needs_review: "En revisión" };
const requestLabels = { received: "Recibido", quoted: "Presupuestado", accepted: "Aceptado", declined: "Rechazado", in_production: "En producción", delivered: "Entregado", cancelled: "Cancelado" };

describe("shared CSV writer", () => {
  it("quotes separators, quotes and line breaks; BOM, ';' and CRLF like the catalog file", () => {
    assert.equal(csvCell('Taza "Kiss"; edición'), '"Taza ""Kiss""; edición"');
    assert.equal(csvCell("dos\nlíneas"), '"dos\nlíneas"');
    assert.equal(csvCell(), "");
    assert.equal(formatCsv(["a", "b"], [["1", "x;y"]]), `${BOM}a;b\r\n1;"x;y"\r\n`);
  });

  it("neutralizes formula cells (= + - @ tab CR) when asked, and only then", () => {
    for (const value of ["=HYPERLINK(1)", "+1", "-2", "@SUM(A1)", "\tx", "\rx"]) {
      assert.ok(csvCell(value, { neutralizeFormulas: true }).replace(/^"/, "").startsWith("'"), value);
    }
    assert.equal(csvCell("=1;2", { neutralizeFormulas: true }), `"'=1;2"`);
    assert.equal(csvCell("Ana", { neutralizeFormulas: true }), "Ana");
    assert.equal(csvCell("=1"), "=1", "the catalog format (re-importable) is unchanged");
  });

  it("writes pesos like the catalog file: no thousands separator, comma for cents", () => {
    assert.deepEqual([pesosCell(890000), pesosCell(150050), pesosCell(5), pesosCell(null)], ["8900", "1500,50", "0,05", ""]);
  });

  it("keeps the catalog toCsv output byte-identical", () => {
    const csv = toCsv([{ sku: "A-1", nombre: 'Taza "Kiss"; edición', precio: "8900" }, { sku: "B-2", opciones: "Color: rojo\nTalle: M" }]);
    assert.equal(
      csv,
      `${BOM}sku;producto;nombre;opciones;categoria;tema;estado;precio;costo;stock;peso_g;largo_cm;ancho_cm;alto_cm\r\n` +
        `A-1;;"Taza ""Kiss""; edición";;;;;8900;;;;;;\r\n` +
        `B-2;;;"Color: rojo\nTalle: M";;;;;;;;;;\r\n`,
    );
  });
});

describe("selected ids", () => {
  const uuid = "0b0e3c3e-6f4e-4c1a-9a57-3a7c1e8f2d10";

  it("accepts a JSON list of well-formed ids, without repeats", () => {
    assert.deepEqual(parseSelectedIds({ ids: [uuid, uuid.toUpperCase(), uuid] }, UUID_ID), { ok: true, ids: [uuid, uuid.toUpperCase()] });
    assert.deepEqual(parseSelectedIds({ ids: ["p08", "xab12cd34"] }, PRODUCT_ID), { ok: true, ids: ["p08", "xab12cd34"] });
  });

  it("rejects bad formats, empty lists and more than the limit", () => {
    for (const body of [null, {}, { ids: "p08" }, { ids: [] }, { ids: [1] }, { ids: ["not-a-uuid"] }, { ids: ["p08' OR 1=1"] }]) {
      assert.equal(parseSelectedIds(body, body?.ids?.[0] === "p08' OR 1=1" ? PRODUCT_ID : UUID_ID).ok, false, JSON.stringify(body));
    }
    const many = Array.from({ length: MAX_EXPORT_IDS + 1 }, (_, i) => `p${i}`);
    const result = parseSelectedIds({ ids: many }, PRODUCT_ID);
    assert.equal(result.ok, false);
    assert.match(result.message, /500/);
    assert.equal(parseSelectedIds({ ids: many.slice(0, MAX_EXPORT_IDS) }, PRODUCT_ID).ok, true);
  });
});

describe("export endpoint guard", () => {
  const admin = { authUserId: "admin-1", email: "admin@example.com", role: "owner" };
  const post = (body, type = "application/json") =>
    new Request("http://localhost/admin/pedidos/exportar", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const options = (overrides) => ({
    admin,
    request: post({ ids: ["p08"] }),
    idPattern: PRODUCT_ID,
    filePrefix: "productos-seleccionados",
    build: async (ids) => `${BOM}ids\r\n${ids.join("|")}\r\n`,
    now: new Date("2026-11-26T02:00:00Z"),
    ...overrides,
  });

  it("answers 404 to non-admins without building the file", async () => {
    let built = false;
    const response = await exportSelection(options({ admin: null, build: async () => ((built = true), "") }));
    assert.equal(response.status, 404);
    assert.equal(built, false);
  });

  it("rejects non-JSON bodies, broken JSON and invalid ids", async () => {
    assert.equal((await exportSelection(options({ request: post("ids=p08", "application/x-www-form-urlencoded") }))).status, 415);
    assert.equal((await exportSelection(options({ request: post("{nope") }))).status, 400);
    const bad = await exportSelection(options({ request: post({ ids: ["../x"] }) }));
    assert.equal(bad.status, 400);
    assert.match(await bad.text(), /\S/);
  });

  it("returns the CSV as an attachment named with the Argentina date", async () => {
    const response = await exportSelection(options());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="productos-seleccionados-2026-11-25.csv"');
    assert.equal(response.headers.get("cache-control"), "no-store");
    // Bytes, not text(): decoding would drop the BOM that Excel needs.
    assert.equal(Buffer.from(await response.arrayBuffer()).toString("utf8"), `${BOM}ids\r\np08\r\n`);
  });
});

describe("exports over PGlite", () => {
  let db;
  let sql;
  let orderA;
  let orderB;
  let requestA;
  let requestB;
  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    const orders = createOrderRepository(sql);
    const pickup = { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null };
    const shipping = { method: "shipping", costMinor: 350000, label: "Correo", ruleId: null, free: false, etaMinDays: 2, etaMaxDays: 5 };
    orderA = await orders.placeOrder({
      idempotencyKey: "export-order-a-key",
      customerId: null,
      contactName: "=Ana Pérez",
      contactEmail: "ana@example.com",
      contactPhone: "2615551234",
      delivery: { method: "pickup" },
      notes: "",
      shipping: pickup,
      lines: [
        { sku: "SUB-P08", productId: "p08", name: "Pack Caos Gráfico", quantity: 2, unitPriceMinor: 890000 },
        { sku: "SUB-P09", productId: "p09", name: "Pack Tribuna", quantity: 1, unitPriceMinor: 720050 },
      ],
      discountMinor: 100000,
      paymentPreference: "transfer",
    });
    orderB = await orders.placeOrder({
      idempotencyKey: "export-order-b-key",
      customerId: null,
      contactName: "Beto",
      contactEmail: "beto@example.com",
      contactPhone: "2615550000",
      delivery: {
        method: "shipping",
        address: { recipient: "Beto", street: "San Martín", streetNumber: "100", apartment: "", city: "Mendoza", province: "Mendoza", postalCode: "5500", notes: "" },
      },
      notes: "",
      shipping,
      lines: [{ sku: "SUB-P10", productId: "p10", name: "Pack Pixel Punk", quantity: 1, unitPriceMinor: 680000 }],
    });
    const requests = createCustomRequestRepository(sql);
    const base = { customerId: null, contactEmail: "eva@example.com", quantity: 50, reference: "", productSlug: null, file: null };
    requestA = await requests.create({ ...base, idempotencyKey: "export-request-a-key", contactName: "Eva", productType: "Stickers", idea: "Logo de la banda; con \"comillas\"" });
    requestB = await requests.create({ ...base, idempotencyKey: "export-request-b-key", contactName: "Flor", productType: "Remeras", idea: "Remeras para el equipo" });
  });
  after(() => db.close());

  it("full catalog export is byte-identical to before (pinned on the seed)", async () => {
    const { createHash } = await import("node:crypto");
    const csv = toCsv(await exportCatalog(sql));
    // Pinned before the selection export was added; a seed change legitimately moves it.
    assert.equal(createHash("sha256").update(csv).digest("hex"), "7d4a7c4b63aa246adbc73f9a69eb5b7ff34f351086a8063fc01bbdb82e89550b");
  });

  it("exports only the selected products, in the same format, ignoring unknown ids", async () => {
    const all = await exportCatalog(sql);
    const rows = await exportCatalog(sql, { productIds: ["p09", "p08", "no-existe"] });
    assert.deepEqual(rows, all.filter((row) => row.producto === "p08" || row.producto === "p09"));
    assert.deepEqual(await exportCatalog(sql, { productIds: ["no-existe"] }), []);
    assert.equal(lines(toCsv(rows))[0], lines(toCsv(all))[0]);
  });

  it("exports the selected orders with their columns and values", async () => {
    const csv = await exportOrdersCsv(sql, [orderA.id, "0b0e3c3e-6f4e-4c1a-9a57-3a7c1e8f2d10"], orderLabels);
    assert.ok(csv.startsWith(BOM));
    const [header, ...rows] = lines(csv);
    assert.equal(header, "pedido;fecha;cliente;email;entrega;estado;pago_elegido;items;subtotal;envio;descuento;total");
    assert.equal(rows.length, 1, "only the selected, existing order");
    const cells = rows[0].split(";");
    assert.equal(cells[0], `SUB-${orderA.number}`);
    assert.match(cells[1], /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/);
    assert.deepEqual(cells.slice(2), [
      "'=Ana Pérez",
      "ana@example.com",
      "Retiro",
      "Pendiente de pago",
      "Transferencia o efectivo",
      "2 × Pack Caos Gráfico | 1 × Pack Tribuna",
      "25000,50",
      "0",
      "1000",
      "24000,50",
    ]);
  });

  it("exports a shipping order with its city and shipping cost", async () => {
    const [, row] = lines(await exportOrdersCsv(sql, [orderB.id], orderLabels));
    const cells = row.split(";");
    assert.deepEqual([cells[4], cells[6], cells[9], cells[10], cells[11]], ["Envío · Mendoza", "Cualquier medio", "3500", "0", "10300"]);
  });

  it("exports the selected custom requests with their columns and values", async () => {
    const [header, ...rows] = lines(await exportRequestsCsv(sql, [requestB.id], requestLabels));
    assert.equal(header, "encargo;fecha;cliente;email;tipo;producto;cantidad;estado;presupuesto;sena;idea;referencia");
    assert.equal(rows.length, 1);
    const cells = rows[0].split(";");
    assert.equal(cells[0], `ENC-${requestB.number}`);
    assert.deepEqual(cells.slice(2), ["Flor", "eva@example.com", "Formulario", "Remeras", "50", "Recibido", "", "", "Remeras para el equipo", ""]);
    const quoted = await exportRequestsCsv(sql, [requestA.id, requestB.id], requestLabels);
    assert.equal(lines(quoted).length, 3);
    assert.ok(quoted.includes('"Logo de la banda; con ""comillas"""'));
  });
});
