# Admin Orders module: audit and redesign plan (stage 3)

- **Date:** 2026-11-27
- **Base:** `f37a296` (stage 2 on QA), branch `feat/admin-orders`
- **Sources:** the code (paths below) and the staging screens at 1366 px wide

## Screens, data and rules

| Route | Screen | Mutations |
|---|---|---|
| `/admin/pedidos` | Status tabs, a table of up to 200 orders, selection with CSV export | None (GET). `POST /admin/pedidos/exportar`, audited as `export.orders` |
| `/admin/pedidos/[id]` | Contact, summary (`OrderSummary`, shared with the customer page), one Actions block, History | `orderAction` (`src/app/admin/pedidos/actions.ts`): `confirm`, `cancel` (note required), `ship` (carrier required; code and https URL optional), `fulfill` |

Guards: each page checks `adminAvailable()` and `getCurrentAdmin()` (store 404); the action and the export check `requireAdmin()`. There is no role check: owners and editors can do everything. Stage 3 keeps that.

### Statuses

There is **one status column**. Its CHECK constraint is in `db/migrations/0009_shipping.sql`:

`pending_payment`, `paid`, `shipped`, `fulfilled`, `cancelled`, `expired`, `needs_review`.

There is no separate payment, preparation or shipment status. Mercado Pago's raw payment state lives in `payments`, which the panel never reads.

### Transitions (`src/server/orders/repository.ts`)

Each transition is one SQL statement that checks the current status.

| From → to | Who | Side effects |
|---|---|---|
| (new) → `pending_payment` | Checkout | Reserves stock for 15 minutes; redeems coupons |
| `pending_payment` → `expired` | `releaseExpired` (page render, store reads) | Releases stock; gives coupon uses back |
| `pending_payment` → `paid` | Admin "Confirmar pago" (transfer) or the Mercado Pago webhook or reconcile | The reservation becomes a sale |
| `expired` → `paid` or `needs_review` | Late payment | `needs_review` when there is no stock left |
| `pending_payment`, `expired`, `needs_review` → `cancelled` | Admin, note required | Releases stock (coupon uses are **not** given back) |
| `paid` (shipping) → `shipped` | Admin, carrier and tracking | `tracking`, `shipped_at` |
| `shipped` or `paid` (pickup) → `fulfilled` | Admin | Status and event only |

Every transition writes an `order_events` row with the actor. Transitions write nothing to `audit_logs`, and no email, webhook or outbox message is sent.

## Problems found

| # | Problem | Evidence | Proposed solution |
|---|---|---|---|
| O1 | **The list shows at most 200 orders, with no pagination and no notice.** | `pedidos/page.tsx` `limit 200`; `listOrders` has no offset or total | Paginate 50 per page with a total, like Productos. |
| O2 | **No search, date filter or sort.** | `listOrders(status, customerId, limit)`; fixed order by date | Search by number (`SUB-1010` or `1010`), name and email; Desde/Hasta (Argentina dates); sort by newest, oldest or total. New read-only SQL, no schema change. |
| O3 | **Payment and delivery are mixed into one label** ("Pago confirmado" says nothing about the shipment). | Single `status` | Two derived views, payment and delivery (`src/server/orders/status-view.ts`). Each gets its own badge and filter. No state is stored or invented. |
| O4 | **There is no preparation state.** | Not in the model | Not shown and not invented. "Sin enviar" / "Para retirar" (paid, not delivered) is the closest existing step. Pending item: a preparation state would need a schema and rule decision. |
| O5 | **Cancelling has no confirmation, and every action shares one note field.** | `order-actions.tsx` | Each action gets its own Dialog. Cancel asks for the required note inside its dialog. No validation or transition changes. |
| O6 | **Payments are invisible.** No Mercado Pago id, amount or status. | `payments` is never read in the admin | A read-only "Pago" card: chosen method, then the Mercado Pago payments (status, amount, date, id) from the existing table. |
| O7 | **The history is hard to read:** raw actors (`system`, `checkout`, `mercadopago`), oldest first, no time element. | `[id]/page.tsx` hand-rendered list | A new design-system `Timeline` component: newest first, readable actors (Sistema, Checkout, Mercado Pago, email), a status badge, and `<time>`. |
| O8 | **The detail page ignores the design system:** a generic "Pedido" title, a text back link, inline action results. | `[id]/page.tsx` | PageHeader titled `SUB-n` with breadcrumbs and payment/delivery badges. Cards: Productos (lines, discounts, shipping, total), Entrega, Pago, Cliente, Acciones, Historial. Toasts for results. |
| O9 | **`needs_review` paints a red cell with no explanation**, and it is a dead end: only cancel. | `is-low`; `cancelOrder` is the only exit | Critical row tone plus the "Pagado · en revisión" badge with an explanation in the detail. The dead end is documented, not changed (it would be a new transition). |
| O10 | **Loading, empty and error states are bare;** database errors read as a 404 in the detail. | `page.tsx`, `[id]/page.tsx` `.catch(() => null)` | Skeleton, EmptyState and `error.tsx`. The detail answers 404 only for a missing order. |
| O11 | **The selection bar pushes the table down when the first row is checked** (shared with Productos and Encargos). | `SelectionBar` mounts only when `count > 0`; the `:has()` rule in `globals.css`; conditional padding in Productos | Reserve the bar's place: the bar is always rendered at a fixed height, with a hint when nothing is checked and the actions once something is. The export button moves to the design-system `Button`. |
| O12 | **The only bulk action is export.** | `SelectionBar` | Bulk **"Marcar entregado"**, safe: one status change and an event per order; orders that don't qualify are reported as skipped. Not offered in bulk: confirming payments (each one asserts a specific transfer and turns stock into a sale), shipping (each needs its own tracking) and cancelling (releases stock, can collide with an ongoing Mercado Pago payment). |
| O13 | **"Reserva hasta" shows only a time.** The phone number is plain text. | List cell; detail contact | Date and time, plus `tel:` and `mailto:` links. |

**Found and not changed (business rules, need your decision):**

- **Cancelling a pending order does not give the coupon use back** (expiring one does). It looks like a bug; changing it changes a rule.
- **A `needs_review` order can only be cancelled.** A "resolve" step (for example, back to paid after restocking) would be a new transition.
- **Order changes never reach Admin › Actividad.** They are recorded only in each order's history.

## Design decisions

- **Derived views, not new states.** Payment and delivery are display mappings of the existing `status`. The URL keeps `?estado=` (exact status, used by Inicio's links) and adds `?pago=`, `?entrega=`, `?q=`, `?desde=`, `?hasta=`, `?orden=` and `?pagina=`.
- **Bulk "Marcar entregado"** reuses the existing per-order `markFulfilled` and reports each order like Productos' bulk actions.
- **Reuse:**
  - From the design system: PageHeader, Breadcrumbs, LinkTabs, Badge, Button, Card, Input, Select, Textarea, Dialog, useToast, EmptyState, Skeleton and Pagination.
  - From Productos: the list layout patterns (container queries, filter form, skeleton, bulk-action pattern).
- **New in the design system:** `Timeline`.
- **No change** to the API (it has no order endpoints), the schema, transitions, validations, permissions or the store. `OrderSummary` stays as the store's component; the admin gets its own layout.
