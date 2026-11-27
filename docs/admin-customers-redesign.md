# Admin Customers redesign (stage 4): delivery

- **Date:** 2026-11-27
- **Branch:** `feat/admin-customers`, on QA at `b8149a7`
- **Audit:** `docs/admin-customers-audit.md` (problems C1–C11)
- **Task log:** `odd/tasks/admin-customers.md`

This branch also carries the order business rules from `docs/admin-orders-rules.md`:

- Rule 1, coupon use freed on cancel: `3ed6d2c`.
- Rule 3, order history in Actividad: `6cedd11` and `c8d55a8`.

An independent verifier passed both rules, and they were checked on QA.

## Problems found

The main ones:

- **Encargos shown under another person (C1).** An encargo belongs to the account that was signed in. The Encargos list showed the contact that was typed in the form.
- **Two URLs per customer (C2).**
- **A heading count that ignored the search (C3).**
- **List limits (C4).** At most 200 accounts, with no filters, sort or pagination.
- **Hidden encargos count (C5).**
- **An ambiguous "Compró" total (C6).**
- **Guest purchases with the same email were invisible (C8).**
- **Old UI (C9).**

The audit lists all eleven with their evidence.

## Solutions implemented

| Commit | Change |
|---|---|
| `2397d82` | **List:** described below. |
| `74ab008` | **Profile:** described below. |

**List** (`2397d82`):

- **Search** by name, email or phone (`%` and `_` taken literally).
- **"Mostrar" filter:** con pedidos pagados, sin pedidos, con encargos, admins.
- **Sign-up date range:** Argentina dates.
- **Sorts:** más recientes, más antiguos, nombre, mayor total pagado, último pedido.
- **Pagination:** 50 per page. The heading counts the matches.
- **Columns:** phone (`tel:` link), orders (with how many are paid), encargos, total paid (with a note on what it counts), sign-up date and last order.
- **Phones:** rows become cards.

**Profile** (`74ab008`):

- **One canonical URL** (auth user id). The old link from an order (`customers.id`) redirects to it.
- **Header:** breadcrumbs, an Admin badge, a "Sin Mi cuenta" badge when it applies, and the sign-up date.
- **Main column:**
  - **Métricas.** Orders, paid, total paid, last order and encargos. Payments under review are counted apart and not added.
  - **Pedidos.** Payment and delivery badges, and "Ver todos en Pedidos".
  - **Encargos.** The contact that was typed and a **"Contacto distinto"** badge, with an explanation of who owns the encargo.
  - **Actividad reciente.** A Timeline of the customer's order and encargo events, with links.
  - **Con el mismo email, sin cuenta.** Shown only when there are guest records; never linked or counted.
- **Side column:**
  - **Contacto.** Email, phone, account created, last session or "Sin sesiones registradas", and whether Mi cuenta was opened.
  - **Direcciones.** Read-only.
- **States:** empty, loading and error, with `error.tsx` and "Reintentar".

## Components

- **Reused:**
  - Design system: PageHeader, Breadcrumbs, Card, Badge, DataTable, Timeline, EmptyState, Skeleton, Pagination, Input, Select.
  - Productos: the shared list styles (`products/list.module.css`).
  - Pedidos: the filter form pattern, the detail layout (`orders/detail.module.css`), the payment and delivery badges (`status-view.ts`), and `actorLabel` / `argentinaDateTime`.
- **New, specific to customers** (`src/components/admin/customers/`):
  - list filters, table and skeleton;
  - profile cards and helpers.
- **New, read-only queries:**
  - `customers/admin.ts` `search()`.
  - `customers/profile.ts`: `customerActivity`, `guestMatches`, `reviewOrderCount`.
- **Unchanged:** `list`, `count` and `get` work exactly as before, pinned by tests.

## Functional changes

- **List URL parameters:** `q`, `tipo`, `desde`, `hasta`, `orden`, `pagina`.
- **Profile URL:** a profile opened by `customers.id` redirects to the auth user id.
- **Total pagado:** the same calculation as before (paid, shipped and fulfilled orders). It is now labelled as such.
- **Unchanged:**
  - No customer can be edited, merged or deduplicated.
  - Relations: `orders.customer_id` and `custom_requests.customer_id`.
  - The schema, the API, permissions and the store.

## QA results

**Automated:** 772 tests, lint with 0 problems, build green. New tests:

- `admin-customers-list.test.mjs`: 12 tests.
- `admin-customer-profile.test.mjs`: 9 tests.
- `admin-activity.test.mjs` and `order-coupon-release.test.mjs` cover the order rules.

**On staging (2 accounts):**

| Check | Result |
|---|---|
| List: Administrador with 10 orders (2 paid), 3 encargos, $5.600 total paid. The total equals SUB-1010 ($1.800) + SUB-1011 ($3.800). | OK |
| Search: `guillermo` and `SUBLIME.COM` (any case); `%` taken literally; the count shows the matches | OK |
| Filters: con pedidos pagados, sin pedidos, con encargos, admins; sign-up dates; an invalid value is ignored | OK |
| Sorts: nombre, total pagado | OK |
| Profile: metrics, orders with badges, encargos, activity, contact | OK |
| **ENC-5002 and ENC-5003:** shown with "Contacto distinto"; the typed contact is "facundo" with his own email, while the encargo belongs to the Administrador account (sent with that session). ENC-5001 also shows the difference. | OK |
| Order → "Cliente con cuenta" (old id) redirects to the canonical profile | OK |
| Account with no activity: empty states for orders, encargos, activity and addresses | OK |
| Order rules on QA: Actividad shows order events with links; "Ver anteriores" pages 50 + 50 with no repeats | OK |
| 1366 | Screenshots of list and profile |
| 1024 | No horizontal scroll; screenshots via page zoom |
| 390 | No page overflow; the list becomes cards. In the profile the orders table scrolls inside its card. Measured by script, no screenshots: the window could not be resized. |

## Risks and pending items

- **Guest matches** ("Con el mismo email, sin cuenta") are covered by tests. They could not be seen on staging, which has no guest orders with an account's email.
- **Permissions:** not tried with an editor (there is no editor account). The guards are unchanged.
- **Customer editing** (name, phone, notes) does not exist. It would need a `customer` audit entity, which is a migration.
- **Encargos screen:** it still shows only the typed contact. Showing the owning account there belongs to the Encargos stage.
- **Times in Actividad** are UTC, while orders and customers use Argentina time. This predates the redesign.
- **The "Ver todos en Pedidos" link** searches by the account's email. It can also return guest orders with that email.
- **Not included** from the order rules: encargo events in Actividad, and the Inicio dashboard's "Actividad reciente".
