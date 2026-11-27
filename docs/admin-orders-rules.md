# Orders: business decisions (2026-11-27)

The three rules below were pending from the orders redesign (`docs/admin-orders-audit.md`). The owner approved them on 2026-11-27. Each one records the decision, what the code does today, the effects on reservations and concurrency, and how to implement it.

## 1. A cancelled order gives its coupon use back

**Decision (verbatim):** "Al cancelar un pedido, liberar el uso reservado del cupón si corresponde, para que pueda volver a utilizarse mientras siga vigente y cumpla sus condiciones."

### Current implementation (coupons)

- **Checkout** (`placeOrder`, `src/server/orders/repository.ts`).
  - In the same statement that creates the order, it inserts one `promotion_redemptions` row per promotion applied (`PRIMARY KEY (promotion_id, order_id)`).
  - It also increments `promotions.uses_count`.
  - `promotions_uses_limit CHECK (max_uses IS NULL OR uses_count <= max_uses)` refuses the order when the coupon has no uses left (error `coupon_exhausted`).
- **Expiry** (`releaseExpired`).
  - The statement that expires unpaid orders also deletes their `promotion_redemptions` rows (`freed`).
  - It also lowers `uses_count` by the number of rows deleted (`unused`, with `greatest(0, …)`).
  - The order keeps its frozen discount (`discount_minor`, `promotions`), which is history.
- **Cancel** (`cancelOrder`).
  - Allowed from `pending_payment`, `expired` and `needs_review`.
  - Releases active stock reservations.
  - **Does not touch** `promotion_redemptions` or `uses_count`. This is the gap.

### When a coupon use applies ("si corresponde")

| Cancelled from | Redemption row exists? | Effect of the new rule |
| --- | --- | --- |
| `pending_payment` | Yes, created at checkout | The row is deleted and `uses_count` goes down by 1 per promotion |
| `expired` | No, expiry already deleted it | Nothing (no double release) |
| `needs_review` | No. The order expired first, which freed it; the late payment does not create a new one | Nothing |

### Effects on reservations and concurrency

- **Same statement.** The release goes into the cancel statement itself, as two more CTEs (`freed`, `unused`) keyed on the order the statement actually cancelled.
  - The statement only changes an order whose status is still cancellable.
  - So a cancel racing with expiry, or with a payment confirmation, releases the coupon at most once.
  - The order row update serializes them, and only the winner sees the redemption row to delete.
- **Stock.** Reservations are not affected: the stock release already in `cancelOrder` stays as it is.
- **Concurrent checkout.** A checkout running at the same time can take the freed use only after the cancel commits. `promotions_uses_limit` keeps guarding the limit.
- **Validity.** Releasing a use does not make an expired or inactive coupon valid. Checkout still checks `active`, `starts_at`, `ends_at`, minimums and limits, so the coupon "can be used again while still valid and meeting its conditions" without new code.
- **History.** The order keeps its frozen discount and coupon code.

**Observed, not decided.** An order that expired and is then paid late (`expired` → `paid` or `needs_review`) keeps its frozen discount. Its coupon use, however, was freed at expiry and is not taken again, so that sale does not count against `max_uses`. Only checkout inserts redemptions, and only expiry deletes them (`repository.ts`). Changing that is a separate decision.

### Implementation plan

- Add the same `freed`/`unused` CTEs that `releaseExpired` uses to `cancelOrder`'s statement, scoped to the `cancelled` order.
- Tests (PGlite):
  - Cancelling a pending order with a coupon frees it.
  - That coupon at its `max_uses` becomes usable again.
  - Cancelling an expired order frees nothing more.
  - A cancel and an expiry on the same order free it only once.
  - Stock moves exactly as today.
- Risk: item 1 (it changes stored counters) and item 4 (concurrency). It needs an independent verifier before delivery.

## 2. Orders in review can only be cancelled

**Decision (verbatim):** "Los pedidos en revisión solamente pueden cancelarse. Mantener las restricciones actuales."

**Current implementation:** `needs_review` comes from a late payment with no stock left (`confirmPayment`). The only transition out of it is `cancelOrder`; ship, fulfill and confirm refuse it. The order detail explains this in the Pago card (stage 3).

**Change:** none. The rule is now documented and must be kept. Cancelling a `needs_review` order does not refund the money; the dialog says a refund is handled separately.

## 3. Order events in Admin › Actividad

**Decision (verbatim):** "Los eventos relevantes de pedidos deben integrarse en Admin → Actividad, reutilizando el historial existente y evitando duplicaciones."

### Current implementation

- Actividad (`src/app/admin/actividad/page.tsx`) lists `audit_logs` only, through `listAudit`. It pages by `audit_logs.id` (`before`).
- Order transitions are written to `order_events` (`from_status`, `to_status`, `actor`, `note`, `created_at`). They never reach `audit_logs`, so the "Pedidos y encargos" area is empty.
- Encargos have their own `custom_request_events`. The same problem applies to them, but it is not part of this decision.

### Plan (no duplication: read the existing history, write nothing new)

- Actividad reads `audit_logs` and `order_events` together: one query with `UNION ALL`, newest first.
- Each order event shows as "SUB-n · Pago confirmado (antes: Pendiente de pago)", with its actor, note and date, and links to the order.
- **Paging:** today it uses the `audit_logs` id. It changes to a `(created_at, source, id)` cursor so both sources page together. `order_events` already has a `(order_id, created_at)` index; a `created_at` index may be needed for the merged ordering.
- **Area filter:** "Pedidos y encargos" includes order events. The other areas are unchanged.
- **"Relevant events":** every status change. Each one is already an event with a note.
- **Unchanged:** the order's own history in the detail page, and `audit_logs` (no new rows).
- Risk: item 6 (rendering), and paging changes for an existing page (item 3, Actividad's `?antes=` links). It needs tests for the merged ordering and the cursor.

## Status

- **Documented** on 2026-11-27.
- **Rules 1 and 3 are not implemented yet.** They wait for the owner's go-ahead.
- **Rule 2** requires no change.
