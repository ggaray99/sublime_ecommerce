# Admin Orders redesign (stage 3): delivery

- **Date:** 2026-11-27
- **Branch:** `feat/admin-orders`, on QA from `f37a296` (stage 2)
- **Audit:** `docs/admin-orders-audit.md` (problems O1–O13)
- **Task log:** `odd/tasks/admin-orders.md`

## Problems found

The audit lists all of them with their evidence. The main ones:

- **One status for everything.** The order has a single status, so payment and delivery read as one label (O3), and there is no preparation state (O4).
- **List limits.** It showed at most 200 orders, with no pagination and no notice (O1), and had no search, date filter or sort (O2).
- **Payments not shown.** Mercado Pago payments were invisible in the panel (O6).
- **Unsafe actions.** Cancelling asked for no confirmation, and every action shared one note field (O5).
- **History hard to read.** It showed raw actor names (O7).
- **Selection bar jump.** The shared bar pushed the table down when the first row was checked, in Pedidos, Productos and Encargos (O11).

## Solutions implemented

| Commit | Change |
|---|---|
| `f270824` | Audit. `src/server/orders/status-view.ts` adds a payment view and a delivery view of the one existing `status`, plus their filters. They are display mappings only; no new state. |
| `1232809` | Order detail. Two columns. Header "Pedido SUB-n" with breadcrumbs, a payment badge, a delivery badge and the date. Cards: Productos, Entrega, Historial (new design-system `Timeline`), Acciones (one Dialog per action), Pago (Mercado Pago payments, read-only, from `payments`) and Cliente. |
| `fc51c99` | Orders list (details below). |
| this delivery | Selection bar keeps its height when a hint is shown (found in QA). Delivery document. |

**Orders list** (`fc51c99`):

- **Search** by number (`SUB-1010` or `1010`), name or email.
- **Filters** for payment and delivery, dates ("desde" and "hasta", Argentina dates) and sort (newest, oldest, highest or lowest total).
- **Tabs:** Todos, Por cobrar, Sin enviar, Para retirar and En revisión.
- **Pagination** of 50 per page.
- **Responsive table:** at 390 px each row becomes a card.
- **Bulk "Marcar entregado"** over the existing `markFulfilled`.
- **Shared selection bar** is always rendered at a fixed height.

**Mapping of the existing statuses:**

| `status` | Payment | Delivery |
|---|---|---|
| `pending_payment` | Pago pendiente | No corresponde |
| `paid` | Pagado | Sin enviar (shipping) / Para retirar (pickup) |
| `shipped` | Pagado | Enviado |
| `fulfilled` | Pagado | Entregado |
| `needs_review` | Pagado · en revisión | No corresponde |
| `expired` | Vencido sin pago | No corresponde |
| `cancelled` | Cancelado | No corresponde |

## Components

- **Reused:**
  - From the design system: PageHeader, Breadcrumbs, LinkTabs, Badge, Button, Card, Input, Select, Textarea, Dialog, useToast, EmptyState, Skeleton, Pagination.
  - From Productos: list layout and styles (`products/list.module.css`), the filter form, the skeleton, the bulk-action pattern, and `SavedMessage`/`useSaveToast`.
- **New in the design system:** `Timeline` (documented in `docs/admin-design-system.md`).
- **Changed, shared:** `SelectionBar`.
  - Always rendered, with `idleHint` when nothing is checked.
  - `ExportSelectedButton` now uses the design-system `Button`.

## Functional changes

**Search and listing:**

- **New URL parameters:** `q`, `pago`, `entrega`, `desde`, `hasta`, `orden`, `pagina`.
- **Inicio links:** `?estado=<status>` still filters by that exact status and now shows "Estado: X · Quitar".
- **Queries:** `searchOrders` and `countToDeliver` are read-only additions. `listOrders` is unchanged for its other callers.

**Actions:**

- Each action has its own dialog. Cancelling asks for its reason inside the dialog. Fields, validations and transitions are the same (`orderAction` was not changed).
- **Bulk:** only "Marcar entregado". Orders that don't qualify are reported with the existing message.
  - Confirming payments, shipping and cancelling are not offered in bulk.
  - Each payment confirms one specific transfer, each shipment needs its own tracking, and cancelling releases stock.

**Errors:**

- The detail answers 404 only for a missing order. Other errors reach `error.tsx` ("Reintentar").

**Unchanged:** statuses, transitions, validations, permissions, the database schema, the API (it has no order endpoints) and the store.

## QA results

**Automated:** 737 tests, lint with 0 problems, build green. New tests:

- `admin-order-status-view.test.mjs`: 4 tests.
- `admin-orders-list.test.mjs`: 17 tests.
- `admin-order-detail.test.mjs`: 11 tests.

**On staging with the admin session:**

Two test orders were created in the staging store, paid by transfer:

- SUB-1011 with shipping to a made-up address.
- SUB-1012 with pickup.

| Check | Result |
|---|---|
| Search: `SUB-1006`, `1006`, `GARAY`, email (any case); `%` taken literally | OK |
| Filters: Pagado, Vencido combined with search, `?estado=paid` (Inicio link) with "Quitar", dates of 10/11, highest total first | OK |
| Pending order: "Por cobrar" tab, "reserva hasta 27/11 12:00", total with $2.000 shipping | OK |
| Confirm payment (SUB-1011) with a note → Pagado · Sin enviar, toast | OK |
| Mark shipped: carrier required (browser); `http://` link refused by the server with the error inside the dialog and the typed values kept; with `https://` → Enviado, tracking shown with "Seguir el envío" | OK |
| Cancel (SUB-1012): reason required in the dialog → Cancelado, "stock reservado se liberó" | OK |
| Bulk "Marcar entregado" on SUB-1011 (shipped), SUB-1010 (pickup) and SUB-1009 (expired) → "2 pedidos marcados como entregados. 1 no se pudo: SUB-1009 (…)" | OK |
| History (Timeline): Checkout de la tienda → Pago confirmado → Enviado, with notes and the actor | OK |
| Pago card: Mercado Pago payments of SUB-1010 (approved $1.800, cancelled $0); "Sin pagos registrados" for transfers | OK |
| Selection bar: the table does not move when a row is checked. Pedidos (432 → 432) and Encargos (262 → 262). Productos moved 4 px when its hint was shown; fixed in this delivery. | OK |
| 1366 × 768 | Screenshots of list and detail |
| 1024 | No horizontal scroll; screenshots via page zoom |
| 390 | No horizontal scroll in list or detail; rows as cards. Measured in a same-origin popup by script, no screenshots: the Chrome window could not be resized. |

**Test data left on staging:**

- **SUB-1010** (staging test order paid with Mercado Pago, pickup) → Entregado.
- **SUB-1011** (QA order, made-up address) → Entregado.
- **SUB-1012** (QA order, pickup) → Cancelado.
- **SUB-1006** (your test order) was not touched.

## Risks and pending items

**Rules found and not changed** (your decision):

- **Coupons on cancel.** Cancelling a pending order does not give the coupon use back; expiry does.
- **Orders in review.** A `needs_review` order can only be cancelled; there is no "resolve" transition.
- **Actividad.** Order changes never reach Admin › Actividad; they live only in each order's history.

**Not covered:**

- **Preparation state.** It does not exist in the model and was not invented. "Sin enviar" / "Para retirar" is the closest step.
- **Permissions.** Not tried in a browser: there is no editor account on staging. Guards are unchanged: `getCurrentAdmin` on the pages, `requireAdmin` in `orderAction` and in the new bulk action.

**Limitations:**

- **Date filters** apply with "Buscar" or Enter. Applying on change would submit while the year is being typed.
- **Search** is an `ILIKE` scan with no index. That is fine at today's size; consider a trigram index with tens of thousands of orders.
- **Selection** covers the current page only (50 orders).
