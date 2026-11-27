// Payment and delivery views of an order. Orders have ONE status column
// (orders.status); these views only split it for display and filtering, so
// every status must map to exactly one payment state and one delivery state,
// and every filter must translate back to existing statuses.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELIVERY_FILTERS,
  deliveryFilterOf,
  orderDeliveryState,
  orderPaymentState,
  PAYMENT_FILTERS,
  paymentFilterOf,
} from "../src/server/orders/status-view.ts";
import { ORDER_STATUSES } from "../src/server/orders/repository.ts";

describe("order payment and delivery views", () => {
  it("gives every status one payment state", () => {
    assert.deepEqual(
      Object.fromEntries(ORDER_STATUSES.map((status) => [status, orderPaymentState(status)])),
      {
        pending_payment: "pending",
        paid: "paid",
        shipped: "paid",
        fulfilled: "paid",
        cancelled: "cancelled",
        expired: "expired",
        needs_review: "review",
      },
    );
  });

  it("gives every status one delivery state, by delivery method", () => {
    const of = (method) => Object.fromEntries(ORDER_STATUSES.map((status) => [status, orderDeliveryState(status, method)]));
    assert.deepEqual(of("shipping"), {
      pending_payment: "none",
      paid: "to_ship",
      shipped: "shipped",
      fulfilled: "delivered",
      cancelled: "none",
      expired: "none",
      needs_review: "none",
    });
    assert.deepEqual(of("pickup"), {
      pending_payment: "none",
      paid: "to_pick_up",
      shipped: "shipped",
      fulfilled: "delivered",
      cancelled: "none",
      expired: "none",
      needs_review: "none",
    });
  });

  it("translates payment filters back to existing statuses", () => {
    assert.deepEqual(PAYMENT_FILTERS.map((filter) => filter.value), ["pendiente", "pagado", "revision", "vencido", "cancelado"]);
    assert.deepEqual(paymentFilterOf("pagado"), { statuses: ["paid", "shipped", "fulfilled"] });
    assert.deepEqual(paymentFilterOf("pendiente"), { statuses: ["pending_payment"] });
    assert.equal(paymentFilterOf("otra"), null);
    assert.equal(paymentFilterOf(undefined), null);
    // Each payment filter selects exactly the statuses whose payment state it names.
    for (const filter of PAYMENT_FILTERS) {
      const { statuses } = paymentFilterOf(filter.value);
      assert.deepEqual(
        statuses,
        ORDER_STATUSES.filter((status) => orderPaymentState(status) === filter.state),
        filter.value,
      );
    }
  });

  it("translates delivery filters back to existing statuses and methods", () => {
    assert.deepEqual(DELIVERY_FILTERS.map((filter) => filter.value), ["sin-enviar", "para-retirar", "enviado", "entregado"]);
    assert.deepEqual(deliveryFilterOf("sin-enviar"), { statuses: ["paid"], method: "shipping" });
    assert.deepEqual(deliveryFilterOf("para-retirar"), { statuses: ["paid"], method: "pickup" });
    assert.deepEqual(deliveryFilterOf("enviado"), { statuses: ["shipped"] });
    assert.deepEqual(deliveryFilterOf("entregado"), { statuses: ["fulfilled"] });
    assert.equal(deliveryFilterOf("x"), null);
    for (const filter of DELIVERY_FILTERS) {
      const { statuses, method } = deliveryFilterOf(filter.value);
      for (const status of statuses) {
        for (const m of method ? [method] : ["shipping", "pickup"]) assert.equal(orderDeliveryState(status, m), filter.state, `${filter.value} ${status} ${m}`);
      }
    }
  });
});
