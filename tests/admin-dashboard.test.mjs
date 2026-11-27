// Admin shell and dashboard (/admin): the side menu's link list (role
// filtering, current section) and the "Para atender" counts, which must match
// the filtered lists they link to (PGlite with migrations + seeds). React
// rendering has no harness here; the pages are checked in the browser.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { navGroups, isCurrentLink, legacyProductsHref, NAV_HOME, DESIGN_SYSTEM_LINK } from "../src/components/admin/shell/nav-items.ts";
import { attentionGroups, loadDashboard, RECENT_ACTIVITY } from "../src/server/admin/dashboard.ts";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { createCustomRequestRepository } from "../src/server/custom-requests/repository.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const files = (folder) => readdirSync(join("db", folder)).filter((n) => n.endsWith(".sql")).sort().map((n) => readFileSync(join("db", folder, n), "utf8"));
const hrefs = (role) => navGroups(role).flatMap((group) => group.links.map((link) => link.href));

describe("old products list links", () => {
  it("sends /admin with list filters to /admin/productos with the same query", () => {
    assert.equal(legacyProductsHref({ stock: "bajo" }), "/admin/productos?stock=bajo");
    assert.equal(
      legacyProductsHref({ q: "taza remera", categoria: "packs", pagina: "2" }),
      "/admin/productos?q=taza+remera&categoria=packs&pagina=2",
    );
    assert.equal(legacyProductsHref({ etiqueta: ["a", "b"] }), "/admin/productos?etiqueta=a&etiqueta=b");
  });

  it("keeps the dashboard when /admin has no query", () => {
    assert.equal(legacyProductsHref({}), null);
    assert.equal(legacyProductsHref({ vacio: undefined }), null);
  });

  it("redirects /admin/inicio to /admin (one dashboard, not two)", async () => {
    const { default: config } = await import("../next.config.ts");
    const rules = await config.redirects();
    assert.deepEqual(
      rules.filter((rule) => rule.source === "/admin/inicio"),
      [{ source: "/admin/inicio", destination: "/admin", permanent: false }],
    );
  });
});

describe("side menu links", () => {
  it("shows Integraciones (API) only to owners, like the page's own guard", () => {
    assert.ok(hrefs("owner").includes("/admin/integraciones"));
    assert.ok(!hrefs("editor").includes("/admin/integraciones"));
    // Everything else is the same for both roles.
    assert.deepEqual(
      hrefs("owner").filter((href) => href !== "/admin/integraciones"),
      hrefs("editor"),
    );
  });

  it("keeps the four groups and their order; Inicio sits above them", () => {
    assert.deepEqual(
      navGroups("owner").map((group) => group.label),
      ["Ventas", "Catálogo", "Tienda", "Sistema"],
    );
    assert.deepEqual(hrefs("owner"), [
      "/admin/pedidos",
      "/admin/encargos",
      "/admin/clientes",
      "/admin/promociones",
      "/admin/productos",
      "/admin/disenos",
      "/admin/soportes",
      "/admin/categorias",
      "/admin/portada",
      "/admin/envios",
      "/admin/puntos",
      "/admin/integraciones",
      "/admin/ajustes",
      "/admin/actividad",
    ]);
    assert.equal(NAV_HOME.href, "/admin");
    assert.equal(NAV_HOME.label, "Inicio");
    // Inicio and Portada no longer share an icon.
    const portada = navGroups("owner").flatMap((group) => group.links).find((link) => link.href === "/admin/portada");
    assert.notEqual(portada.icon, NAV_HOME.icon);
  });

  it("keeps the design system page out of the menu groups", () => {
    assert.ok(!hrefs("owner").includes(DESIGN_SYSTEM_LINK.href));
    assert.equal(DESIGN_SYSTEM_LINK.href, "/admin/sistema-de-diseno");
  });

  it("marks the current section: Inicio only at /admin, products at /admin/productos/*, sub-pages under their section", () => {
    const all = [NAV_HOME, ...navGroups("owner").flatMap((group) => group.links)];
    const current = (path) => all.filter((link) => isCurrentLink(link, path)).map((link) => link.href);
    assert.deepEqual(current("/admin"), ["/admin"]);
    assert.deepEqual(current("/admin/productos"), ["/admin/productos"]);
    assert.deepEqual(current("/admin/productos/p08"), ["/admin/productos"]);
    assert.deepEqual(current("/admin/productos/nuevo"), ["/admin/productos"]);
    assert.deepEqual(current("/admin/pedidos/123"), ["/admin/pedidos"]);
    assert.deepEqual(current("/admin/ajustes/paginas"), ["/admin/ajustes"]);
    assert.deepEqual(current("/admin/sistema-de-diseno"), []);
    // A prefix that is not a path segment does not match.
    assert.deepEqual(current("/admin/pedidosx"), []);
  });
});

describe("attention groups", () => {
  const zeroOrders = { pending_payment: 0, paid: 0, shipped: 0, fulfilled: 0, cancelled: 0, expired: 0, needs_review: 0 };
  const zeroRequests = { received: 0, quoted: 0, accepted: 0, declined: 0, in_production: 0, delivered: 0, cancelled: 0 };

  it("lists only what needs attention, with links to the filtered lists", () => {
    const groups = attentionGroups({
      orders: { ...zeroOrders, pending_payment: 2, needs_review: 1, paid: 3, shipped: 9 },
      requests: { ...zeroRequests, received: 4, quoted: 7 },
      stock: { sin: 5, bajo: 0 },
    });
    assert.deepEqual(
      groups.map((group) => [group.id, group.items.map((item) => [item.label, item.count, item.href])]),
      [
        [
          "orders",
          [
            ["Pendientes de pago", 2, "/admin/pedidos?estado=pending_payment"],
            ["En revisión", 1, "/admin/pedidos?estado=needs_review"],
            ["Pago confirmado, sin enviar", 3, "/admin/pedidos?estado=paid"],
          ],
        ],
        ["requests", [["Recibidos sin presupuesto", 4, "/admin/encargos?estado=received"]]],
        ["stock", [["Sin stock", 5, "/admin/productos?stock=sin"]]],
      ],
    );
  });

  it("keeps every group, empty, when nothing needs attention", () => {
    const groups = attentionGroups({ orders: zeroOrders, requests: zeroRequests, stock: { sin: 0, bajo: 0 } });
    assert.deepEqual(
      groups.map((group) => [group.id, group.items.length, group.listHref]),
      [
        ["orders", 0, "/admin/pedidos"],
        ["requests", 0, "/admin/encargos"],
        ["stock", 0, "/admin/productos"],
      ],
    );
    for (const group of groups) assert.ok(group.emptyMessage.startsWith("No hay"), group.emptyMessage);
  });
});

describe("dashboard data (PGlite)", () => {
  let db;
  let sql;

  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };

    // Orders: one placed through checkout (pending payment, reservation not due), two set directly.
    const orders = createOrderRepository(sql);
    await orders.placeOrder({
      idempotencyKey: "dashboard-order-a-key",
      customerId: null,
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "2615551234",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      lines: [{ sku: "SUB-P10", productId: "p10", name: "Pack Pixel Punk", quantity: 1, unitPriceMinor: 680000 }],
    });
    let seq = 0;
    for (const status of ["paid", "paid", "needs_review", "shipped"]) {
      seq++;
      await db.query(
        `INSERT INTO orders (access_token, contact_name, contact_email, delivery, status, subtotal_minor, idempotency_key, expires_at)
         VALUES ($1, 'Beto', 'beto@example.com', '{"method":"pickup"}', $2, 1000, $3, now())`,
        ["t".repeat(32), status, `dashboard-order-key-${seq}`],
      );
    }

    // Custom requests: two received, one already quoted.
    const requests = createCustomRequestRepository(sql);
    const base = { customerId: null, contactEmail: "eva@example.com", quantity: 10, reference: "", productSlug: null, file: null, productType: "Stickers", idea: "Logo de la banda para la gira" };
    const first = await requests.create({ ...base, idempotencyKey: "dashboard-request-a-key", contactName: "Eva" });
    await requests.create({ ...base, idempotencyKey: "dashboard-request-b-key", contactName: "Flor" });
    const third = await requests.create({ ...base, idempotencyKey: "dashboard-request-c-key", contactName: "Gabi" });
    await db.query("UPDATE custom_requests SET status = 'quoted', quote_minor = 500000 WHERE id = $1", [third.id]);
    assert.ok(first.id);

    // Stock: p08 has nothing on hand (sin stock), p09 has 2 (stock bajo).
    const setOnHand = (legacyId, onHand) =>
      db.query(
        "UPDATE inventory SET on_hand = $2 WHERE variant_id IN (SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.legacy_id = $1)",
        [legacyId, onHand],
      );
    await setOnHand("p08", 0);
    await setOnHand("p09", 2);

    // Activity: more entries than the dashboard shows.
    for (let i = 1; i <= 7; i++) {
      await db.query(
        "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes) VALUES ('u-1', 'admin@example.com', 'product.update', 'product', $1, '{}'::jsonb)",
        [`p0${i}`],
      );
    }
  });
  after(() => db.close());

  it("counts orders, requests and stock like the lists they link to", async () => {
    const data = await loadDashboard(sql);
    const byId = Object.fromEntries(data.attention.map((group) => [group.id, Object.fromEntries(group.items.map((item) => [item.href, item.count]))]));
    assert.deepEqual(byId.orders, {
      "/admin/pedidos?estado=pending_payment": 1,
      "/admin/pedidos?estado=needs_review": 1,
      "/admin/pedidos?estado=paid": 2,
    });
    assert.deepEqual(byId.requests, { "/admin/encargos?estado=received": 2 });

    // Same definition as the products list filters (?stock=sin / ?stock=bajo).
    const admin = createAdminRepository(sql);
    const total = async (stock) => (await admin.searchProducts({ query: "", sort: "orden", page: 1, stock })).total;
    const sin = await total("sin");
    const bajo = await total("bajo");
    assert.ok(sin >= 1 && bajo >= 1, `sin ${sin}, bajo ${bajo}`);
    assert.deepEqual(byId.stock, { "/admin/productos?stock=sin": sin, "/admin/productos?stock=bajo": bajo });
  });

  it("brings the latest activity entries, newest first", async () => {
    const data = await loadDashboard(sql);
    assert.equal(RECENT_ACTIVITY, 5);
    assert.equal(data.recent.length, RECENT_ACTIVITY);
    assert.deepEqual(
      data.recent.map((entry) => entry.entityId),
      ["p07", "p06", "p05", "p04", "p03"],
    );
  });
});
