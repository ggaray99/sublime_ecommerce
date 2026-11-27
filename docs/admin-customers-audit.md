# Admin Customers module: audit and redesign plan (stage 4)

- **Date:** 2026-11-27
- **Base:** `af142c4` (stage 3 on QA), branch `feat/admin-customers`
- **Sources:** the code (paths below)

## Screens, data and rules

| Route | Screen | Mutations |
|---|---|---|
| `/admin/clientes` | List of accounts: up to 200, no pagination; search over email, name and phone | None |
| `/admin/clientes/[id]` | Profile: contact, "Compró", orders, encargos, addresses | None |

- **Guards.** Both pages check `adminAvailable()` and `getCurrentAdmin()` (store 404).
- **No mutations anywhere.** Admins cannot edit, merge or annotate customers. There is no API v1 customer endpoint.
- **Audit.** `audit_logs.entity` has no `customer` value (CHECK in `0020_designs.sql`).

### Data model

- **`auth_users`** is one row per sign-up. `email` is UNIQUE.
- **`customers`** is one row per auth user (`auth_user_id UNIQUE`). It is created **lazily** by `ensureCustomer` the first time the person opens Mi cuenta, checkout or an encargo. `customers.email` is not unique, but it mirrors the auth email.
- **`customer_addresses`:** up to 10 per customer, one default. Only the customer manages them, from the store.
- **Orders and encargos** carry a nullable `customer_id`: the account that was **signed in** when they were placed. They also keep a free-text `contact_name` / `contact_email` / `contact_phone` snapshot. Guests have `customer_id` NULL.
- **"Registered date"** is `auth_users.created_at` (the sign-up).

## Problems found

| # | Problem | Evidence | Proposed solution |
|---|---|---|---|
| C1 | **Encargos appear under a different person than the Encargos list shows** (ENC-5002, ENC-5003). | The list shows the typed `contact_*`; the profile selects by `customer_id`, the signed-in account (`encargos/actions.ts`, `lab-actions.ts`). | Keep ownership (`customer_id` drives Mi cuenta and file access). Show the contact on each profile row and flag a contact that differs from the account email. The Encargos side waits for the Encargos stage. |
| C2 | **Two URLs per customer.** | The list links with the auth id; the order card links with `customers.id`; `get` accepts both. | Keep accepting both (old links keep working), but every link uses one id. |
| C3 | **The heading count ignores the search.** | `repo.count()` | Show the number of matches. |
| C4 | **At most 200 customers, sorted only by sign-up date, no filters.** | `LIMIT 200`; fixed `ORDER BY` | Pagination of 50; sorts (newest, oldest, name, total paid, last order); filters (with paid orders, without orders, with encargos, admins); sign-up date range. |
| C5 | **The encargos count is computed but not shown.** | `admin.ts` `requestCount` | Add an "Encargos" column. |
| C6 | **"Compró" is ambiguous and leaves out `needs_review`** (money received). | `admin.ts` statuses `paid, shipped, fulfilled` | Label it exactly: "Total pagado (pagados, enviados y entregados)". `needs_review` is shown separately as a count, not added: it may be refunded. No refunds exist to subtract. |
| C7 | **The profile shows raw order statuses and a bare encargo list.** | `[id]/page.tsx` | Reuse the payment and delivery badges (`status-view.ts`). Encargos get number, date, contact, product, quantity and status. |
| C8 | **Guest orders and encargos with the same email are invisible.** | Matching is only by `customer_id` | A separate, labelled section: "Con el mismo email, sin cuenta (invitado)". It is never added to the counts or totals and never merged. |
| C9 | **Old UI:** no breadcrumbs, a plain "Cargando…", no error boundary, phone not clickable. | Both pages | PageHeader, Breadcrumbs, Card, LinkTabs, Badge, Pagination, EmptyState, Skeleton, `error.tsx`, `tel:` and `mailto:` links. |
| C10 | **"Última actividad" goes blank when sessions are deleted.** | `max(auth_sessions.updated_at)` | Label it "Última sesión" and show "Sin sesiones registradas" when empty. |
| C11 | **The list's "Alta" shows a time that adds noise.** | List | Date only in the list; date and time in the profile. |

## Reliable metrics (no invented data)

- **Reliable:** orders by payment state, the last order date, encargos by status, the address count, sign-up date, last session, and total paid (paid, shipped and fulfilled orders, computed like `orderTotalMinor`).
- **Not shown, because they would be invented:**
  - totals that include guest orders;
  - average ticket;
  - encargo revenue (encargos have no payments);
  - segments or tags;
  - marketing consent;
  - "verified".

## Restrictions honoured

- **No merging or deduplication of customers** and no relation changes. Ownership stays `customer_id`; guest records matched by email are shown apart, read-only.
- **No schema change:** the work is read-only queries and display. Admin edits of customers are out of scope; they would need a `customer` audit entity, which is a migration.
- **The store is untouched.**

## Plan

- **List** (`/admin/clientes`): same patterns as Pedidos.
- **Profile** (`/admin/clientes/[id]`):
  - header with name, account and admin badges;
  - metrics card;
  - contact card;
  - addresses card;
  - orders with badges;
  - encargos with contact;
  - guest matches.
- **Recent activity on the profile:** the latest events of the customer's orders and encargos, from their existing histories (`order_events`, `custom_request_events`), in the design-system `Timeline`.
