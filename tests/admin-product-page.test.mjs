// Product page, new product and import (stage 2, T5): the pure rules behind
// the publication card, the stock count preview, the error summary and the
// import review. The server actions keep their own validation (tested in
// admin.test.mjs, product-extras.test.mjs and admin-product-changes.test.mjs).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  errorSummaryItems,
  importReview,
  statusActions,
  statusChangeMessage,
  statusDescription,
  stockDifference,
} from "../src/components/admin/products/product-page-helpers.ts";

describe("publication card: available status changes", () => {
  it("offers Publicar for a draft", () => {
    assert.deepEqual(statusActions("draft"), [{ status: "active", label: "Publicar", confirm: false }]);
  });

  it("offers Pasar a borrador and Archivar (confirmed) for a published product", () => {
    assert.deepEqual(statusActions("active"), [
      { status: "draft", label: "Pasar a borrador", confirm: false },
      { status: "archived", label: "Archivar", confirm: true },
    ]);
  });

  it("offers Volver a borrador and Publicar for an archived product", () => {
    assert.deepEqual(statusActions("archived"), [
      { status: "draft", label: "Volver a borrador", confirm: false },
      { status: "active", label: "Publicar", confirm: false },
    ]);
  });

  it("explains each status", () => {
    assert.match(statusDescription("active"), /se ve en la tienda/);
    assert.match(statusDescription("draft"), /no se ve en la tienda/);
    assert.match(statusDescription("archived"), /no se ve en la tienda/);
  });
});

describe("publication card: result message", () => {
  const item = { id: "a1", name: "Sticker A1" };
  const empty = { changed: [], unchanged: [], skipped: [] };

  it("confirms a published product", () => {
    assert.deepEqual(statusChangeMessage({ ...empty, changed: [item] }, "active"), {
      tone: "success",
      message: "Producto publicado: ya se ve en la tienda.",
    });
  });

  it("confirms a draft and an archived product", () => {
    assert.equal(statusChangeMessage({ ...empty, changed: [item] }, "draft").message, "El producto pasó a borrador: ya no se ve en la tienda.");
    assert.equal(statusChangeMessage({ ...empty, changed: [item] }, "archived").message, "Producto archivado: ya no se ve en la tienda.");
  });

  it("says when nothing changed", () => {
    assert.deepEqual(statusChangeMessage({ ...empty, unchanged: [item] }, "draft"), { tone: "info", message: "El producto ya estaba en borrador." });
  });

  it("gives the skipped reason, e.g. a product without price cannot be published", () => {
    const reason = "Ingresá un precio en pesos, por ejemplo 2500 o 2.500,50.";
    assert.deepEqual(statusChangeMessage({ ...empty, skipped: [{ ...item, reason }] }, "active"), {
      tone: "critical",
      message: `No se pudo publicar: ${reason}`,
    });
  });
});

describe("stock count preview", () => {
  it("shows the difference the count records", () => {
    assert.deepEqual(stockDifference(10, "15"), { delta: 5, text: "Se registra +5" });
    assert.deepEqual(stockDifference(10, "7"), { delta: -3, text: "Se registra −3" });
  });

  it("says when the count matches the current stock", () => {
    assert.deepEqual(stockDifference(4, "4"), { delta: 0, text: "Sin diferencia con el stock en depósito." });
  });

  it("shows nothing for an empty or invalid count (the server validates it)", () => {
    assert.equal(stockDifference(4, ""), null);
    assert.equal(stockDifference(4, "-2"), null);
    assert.equal(stockDifference(4, "3,5"), null);
  });
});

describe("error summary", () => {
  const labels = { name: "Nombre", slug: "URL (slug)", price: "Precio", categoryId: "Categoría" };

  it("lists the invalid fields in form order, with their labels", () => {
    const fields = { price: "Ingresá un precio.", name: "Completá el nombre.", slug: undefined };
    assert.deepEqual(errorSummaryItems(fields, labels), [
      { field: "name", label: "Nombre", message: "Completá el nombre." },
      { field: "price", label: "Precio", message: "Ingresá un precio." },
    ]);
  });

  it("keeps errors of fields without a label at the end", () => {
    assert.deepEqual(errorSummaryItems({ options: "Definí al menos un valor.", name: "Completá el nombre." }, labels), [
      { field: "name", label: "Nombre", message: "Completá el nombre." },
      { field: "options", label: null, message: "Definí al menos un valor." },
    ]);
  });

  it("is empty without errors", () => {
    assert.deepEqual(errorSummaryItems(undefined, labels), []);
    assert.deepEqual(errorSummaryItems({ name: undefined }, labels), []);
  });
});

describe("import review", () => {
  const line = (row, result) => ({ row, sku: `SKU-${row}`, result, detail: "" });

  it("shows only new, changed and error rows and counts the unchanged ones", () => {
    const report = {
      dryRun: true,
      lines: [line(2, "unchanged"), line(3, "created"), line(4, "updated"), line(5, "unchanged"), line(6, "failed")],
      summary: { created: 1, updated: 1, unchanged: 2, failed: 1 },
    };
    const review = importReview(report);
    assert.deepEqual(
      review.rows.map((row) => row.row),
      [3, 4, 6],
    );
    assert.equal(review.unchanged, 2);
  });
});
