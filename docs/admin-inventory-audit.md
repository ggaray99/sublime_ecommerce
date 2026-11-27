# Admin Inventory: audit and redesign plan (stage 5)

- **Date:** 2026-11-27
- **Base:** `f6f9e04` (stage 4); branch `feat/admin-inventory`
- **Sources:** the code (paths below)

## What exists today

- **No inventory screen.** Stock is managed per product (product page "Stock" card: count form plus the last 20 movements).
- **Other places that show stock:**
  - the products list (Stock column, filter, sort);
  - Inicio ("Stock" card);
  - Actividad ("Stock" area);
  - CSV import;
  - API v1 `POST stock/bulk-count`.
- **No warehouses or locations.** Each variant has a single stock pool. Nothing here assumes more.

### Data model (`db/migrations/0001_catalog_inventory.sql`, `0008`, `0015`, `0017`)

| Table | What it holds | Guards |
|---|---|---|
| `product_variants` | SKU, options, `track_stock` (false = made to order, "a pedido"), `is_default`, `active` | SKU format and uniqueness; one default per product |
| `inventory` | One row per variant: `on_hand` (physical), `reserved` | `on_hand >= 0`, `reserved >= 0`, **`reserved <= on_hand`** |
| `stock_reservations` | One per order and variant; status `active`, then `converted`, `released` or `expired`; `expires_at`; `order_id` | `resolved_at` set exactly when the reservation is no longer active |
| `inventory_movements` | Append-only ledger: `delta_on_hand`, `delta_reserved`, `reason`, `reservation_id`, `actor`, `note` | reason in 7 values; at least one delta ≠ 0 |
| `products.low_stock_threshold` | Per-product alert threshold (empty means the default 5) | 0..100000 |

### How stock is computed (verified)

- **Physical** = `on_hand`. **Reserved** = `reserved`. **Available** = `on_hand − reserved`.
- **Product level** (admin): the sum over **active** variants (`ACTIVE_STOCK`). `track_stock` comes from the default variant.
- **Store and checkout:** per variant, `greatest(0, on_hand − reserved)`. A tracked variant without an inventory row has 0 available.
- **Made to order** (`track_stock = false`): no stock is counted. Shown as "A pedido".

## Business rules verified (no change)

| Flow | What it does to stock | Movement (reason, actor) |
|---|---|---|
| Checkout (`placeOrder`) | `reserved += qty` per variant; reservation for 15 minutes | `reservation_created`, actor `checkout`, note "Pedido SUB-n" |
| Expiry (`releaseExpired`, run when the panel, cart and checkout load) | `reserved −= qty`; order → expired | `reservation_expired`, actor `system` |
| Payment on time (`confirmPayment`) | `on_hand −= q` and `reserved −= q`; reservation → converted | `sale`, actor admin email or `mercadopago` |
| Late payment (order expired) | `on_hand −= q` if there is stock; otherwise order → `needs_review`, no stock change | `sale` with **no reservation link** |
| Cancel (`cancelOrder`) | `reserved −= q`; reservation → released | `reservation_released`, actor admin email |
| Ship and deliver | **No stock change** (stock left at payment) | — |
| Admin count (`countStock`) | Absolute count, reason `restock` or `adjustment` (note required for adjustment); refused below `reserved`; refused for "a pedido" | `restock` / `adjustment` with the difference; audit `inventory.count` |
| Product creation | Initial stock | `initial_count` |
| CSV import / API `stock/bulk-count` | Same `recordCount` as the admin count | `adjustment` (CSV), actor `integration:<key>` (API) |

**Negative stock is impossible.** The database checks (`on_hand >= 0`, `reserved <= on_hand`) reject it. Every writer is a single statement, and a breach becomes "sin stock" for the customer (`insufficient_stock`) or `needs_review` for a late payment.

## Problems found

| # | Problem | Evidence | Proposed solution (no rule change) |
|---|---|---|---|
| I1 | No inventory overview | No route | `/admin/inventario`: summary, variant list, filters, sort, pagination |
| I2 | The product page's movement list shows raw English reasons for reservations with "0" (the reserved delta is not read), dates in UTC without time, raw actors, no order link, 20 rows | `[id]/page.tsx`, `listMovements` | A movement view with all 7 reasons labelled; physical and reserved deltas; Argentina time; readable actors (Checkout, Sistema, Mercado Pago, Integración, Carga inicial); link to the order through the reservation; paging |
| I3 | No per-variant breakdown of physical, reserved and available | The variants table shows only available | A per-variant table in the inventory detail |
| I4 | Reservations are invisible (which orders hold stock, until when) | — | "Reservas activas" with the order link and expiry |
| I5 | "Stock actualizado." even when the count equals the current value (nothing is written) | `countStockAction` | Say "Sin cambios: el stock ya era N." (same action, a message change only) |
| I6 | The count asks for an absolute number only | Stock form | Enter either the new total or "+/− units"; the screen shows current → result. It still saves through the same absolute count, and a dialog confirms first. |
| I7 | Inactive variants hide their stock and reservations | Totals and the form use active variants only | Show them in the inventory detail, marked "Inactiva"; the list filter can include them. Read-only; the totals rule is unchanged. |
| I8 | Actividad "Stock" entries name the product by its id, with no SKU | `shared.tsx` | Out of scope for this stage (Actividad). Listed as pending. |

## Need a rule decision (not implemented, waiting for your approval)

1. **Late-payment sale with no order reference.** The movement has no `reservation_id` and its note has no order number, so it cannot be linked to the order. The proposal is to put "Pedido SUB-n" in that movement's note. That changes what the writer records.
2. **Concurrent counts can split the ledger from the stock.** `recordCount` reads the previous value without locking and writes an absolute one. Two counts at the same moment, or a count racing a sale, can leave the sum of movements different from `on_hand`. The proposal is to lock the row and compute the difference in the same statement, or to reject the count when the stock changed after the form loaded.
3. **"Reposición" (restock) accepts a decrease.** Should a restock only add?
4. **Two definitions of "stock bajo".**
   - **List, filters and Inicio:** by product (the sum of variants), 1..threshold; 0 is "sin stock"; drafts and archived products included.
   - **Email alert:** by variant, available ≤ threshold (0 included); published products only.
   - This stage keeps both as they are (see the decision below). Unifying them is a rule decision.
5. **There is no way to return sold units to stock** after a refund. Paid orders cannot be cancelled.
6. **CSV import always records "Ajuste"**, even when goods come in.
7. **Expiry is lazy.** Reservations are released when a page loads, not on a schedule. The inventory pages run `releaseExpired` first, like Pedidos.

## Design decisions for this stage

- **The list is by variant** (one row per SKU), because physical, reserved and available live per variant.
- **Variant state** uses the existing `productStockState` with that variant's own numbers and the product's threshold: 0 or less is "Sin stock", 1..threshold is "Stock bajo". This is the list's rule applied per row, not a new rule.
- **The summary cards** count products with the same rule as Productos and Inicio, so the numbers match those screens. Each card says what it counts.
- **"A pedido" variants** are not inventory. They are listed only under the "A pedido" filter.
- **Adjustments** go through the existing `countStockAction` / `recordCount`: same validation, same audit, same movement.
- **Movements are read** from `inventory_movements` and are never copied. The order reference comes from `reservation_id → stock_reservations.order_id`.
- **No schema, API, store or business-rule change.**
