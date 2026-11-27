# Admin Inventory (stage 5): delivery

- **Date:** 2026-11-27
- **Branch:** `feat/admin-inventory`; on QA at `6185323`
- **Audit and verified rules:** `docs/admin-inventory-audit.md`
- **Task log:** `odd/tasks/admin-inventory.md`

## Initial audit (summary)

- There was **no inventory screen**. Stock lived only on each product's page, plus a column and filter in Productos.
- **One stock pool per variant**, with no warehouses:
  - **Physical:** `inventory.on_hand`.
  - **Reserved:** `inventory.reserved`, held by pending orders for 15 minutes.
  - **Available:** physical minus reserved.
- **"A pedido" products** (`track_stock = false`) carry no stock.
- **Ledger:** `inventory_movements` records every change with one of 7 reasons, the actor and a note.
- **Negative stock is impossible.** The database checks (`on_hand >= 0`, `reserved <= on_hand`) block it, and every writer is a single statement.

## Business rules verified (unchanged)

| Event | Effect on stock |
|---|---|
| Checkout | Reserves the units for 15 minutes |
| Expiry | Releases the reservation (`releaseExpired`, run when a page loads, including the inventory pages) |
| On-time payment | Turns the reservation into a sale: physical and reserved both go down |
| Late payment | Sells if stock is available; otherwise the order goes to `needs_review` with no stock change |
| Cancel | Releases the reservation |
| Ship / deliver | No stock change |
| Manual count | Absolute count with a reason: Reposición, or Ajuste with a required note. It cannot go below the reserved units, and "a pedido" products cannot be counted. |
| CSV import / API `stock/bulk-count` | Same count path as the manual count |

Seven items would need **new rules** and wait for the owner's decision; nothing was implemented (see the audit):

1. The late-payment sale has no link to its order.
2. A count racing a sale or another count can split the ledger from `on_hand`.
3. "Reposición" accepts a decrease.
4. Two different definitions of "stock bajo".
5. There are no returns to stock.
6. CSV import always records an "Ajuste".
7. Reservation expiry is lazy (it runs when a page loads).

## UX problems found → solutions

| # | Problem | Solution |
|---|---|---|
| I1 | No stock overview | `/admin/inventario`: summary plus a list by variant |
| I2 | The product page's movements showed raw reasons, UTC dates, no reserved delta and no order | One movement view: Spanish labels, Argentina time, physical and reserved deltas, readable actor, order link |
| I3 | No per-variant physical, reserved and available | Variant table in the inventory detail |
| I4 | Reservations were invisible | "Reservas activas" with the order and its expiry |
| I5 | "Stock actualizado." even when nothing changed | "Sin cambios: el stock ya era N." |
| I6 | The count accepted only an absolute total | Add or subtract, or count the total; shows the expected result; confirms before applying |
| I7 | Inactive variants hid their stock | Shown in the detail with an "Inactiva" badge; the list has a filter to include them |
| — | Actividad and Integraciones showed UTC | Argentina time (display only; stored timestamps stay UTC) |

## Changes implemented

| Commit | Change |
|---|---|
| `2bcaac5` | Actividad and Integraciones in Argentina time |
| `e769401` | Audit, plus `movement-view.ts` and `movements.ts`: the shared, read-only view of the ledger, with the order behind each reservation |
| `9ee1b73` | `/admin/inventario` (summary, list), `/admin/inventario/movimientos`, "Inventario" in the menu |
| `7418f15` | Inventory detail, adjustment dialog, product page movements, "Sin cambios" message |
| `6185323` | QA fix: the adjustment always stops at the confirmation step (see below) |

**Summary** (`/admin/inventario`):

- Products and variants with stock tracking.
- Products out of stock and with low stock, counted the same way as Productos and Inicio, each linking to that filter.
- Units available and units reserved.

**List** (one row per variant):

- Thumbnail, product, variant, SKU, physical, reserved, available and state.
- Filters: state, category, with reservations, include inactive variants.
- 5 sorts and pages of 50.

**Movimientos:**

- Columns: date, product, variant and SKU, type (Entrada, Salida, Ajuste, Reserva) with the reason, physical and reserved deltas, note, responsible, and order.
- Filters: type, text and dates.

**Detail:**

- Variants: all, including inactive ones, with totals over active variants.
- Active reservations.
- Availability.
- Paged history.

**Adjustment:** it reuses the existing `countStockAction`, so validation, the movement and the audit entry are the same as a manual count. There is no new write path.

## Components

- **Reused:**
  - From the design system: PageHeader, Breadcrumbs, Card, Badge, Button, Dialog, Input, Select, Textarea, EmptyState, Skeleton, Pagination, toasts.
  - From earlier stages:
    - list styles (`products/list.module.css`) and the URL-parsing pattern (`customer-search.ts`);
    - the detail layout and the persistent `useActionState` pattern for dialogs (`orders/detail-*`, `order-actions.tsx`);
    - `argentinaDateTime`;
    - the stock-state rule (`productStockState`) and the product facets (`productFacets`).
- **New:**
  - `src/server/inventory/`: `movement-view.ts`, `movements.ts`, `admin-inventory.ts`, `inventory-search.ts`, `admin-detail.ts`. All read-only.
  - `src/components/admin/inventory/`: list, movements, detail and adjustment dialog.

## QA results

**Automated:** 809 tests, lint with 0 problems, build green. New tests:

- `inventory-movements.test.mjs`: 7 tests.
- `admin-inventory-list.test.mjs`: 14 tests.
- `admin-inventory-detail.test.mjs`: 16 tests.

**On staging with the admin session:**

| Check | Result |
|---|---|
| Summary: 65 products and 66 variants with stock tracking, 0 out of stock, 1 low (same as Productos), 1269 available, 0 reserved | OK |
| Test order SUB-1013 (pickup, transfer): reserved goes to 1, available to 1268; STK-044 shows 18 / 1 / 17; the "con reservas" filter lists only it | OK |
| Detail of STK-044: active reservation "Pedido SUB-1013 · vence 27/11 15:32"; movements with reservation, release and sale, each linked to its order | OK |
| Cancel SUB-1013: "el stock reservado se liberó"; Movimientos shows the release −1 and the reservation +1 with responsible and order; STK-044 back to 0 reserved | OK |
| Adjustment on the QA test product: +2 restock with a note, then −2 "Ajuste" (note required: blocked without it), then counting 8 when 8 were already there → "Sin cambios: el stock ya era 8." | OK after the fix |
| Filters: search by SKU, literal `%`, Stock bajo, Sin stock with inactive variants | OK |
| Product page: new movement rows and the "Ver inventario y movimientos" link | OK |
| Actividad › Stock in Argentina time (the 13:21 UTC entry now shows 10:21) | OK |
| 1366 | Screenshots |
| 1024 (page zoom: the list breakpoints use the list's own width) | No horizontal scroll; SKU column hidden |
| 390 (page zoom with the menu hidden) | No horizontal scroll. List and Movimientos become cards; the detail's variant table scrolls inside its card. |

**Bug found and fixed in QA (`6185323`).** The first click on "Revisar ajuste" applied the adjustment without the confirmation step. React reused that button as the "Confirmar ajuste" submit button within the same click. Distinct keys and `preventDefault` fixed it, and QA confirmed the confirmation step now always appears.

**Test data on staging:**

- SUB-1013 was created and cancelled.
- QA-REDISENO-01 (archived test product) got +2 and −2: net 0. Its movements remain in the history.

## Risks and pending items

- **Width checks.** The 390 and 1024 widths were checked with page zoom, because the Chrome window could not be resized and the popup stayed hidden. The phone top bar depends on the window width and was not re-checked here (validated in stage 1).
- **Permissions.** Not tried with an editor account (staging has none). All pages keep the admin guard; adjustments go through `requireAdmin` in `countStockAction`.
- **The 7 rule decisions** listed in the audit.
- **Actividad › Stock** shows the product id rather than the name or SKU (I8).
- **Product counts versus variant rows.** The summary counts products, as in Productos and Inicio; the list shows variants. Each card says what it counts.
