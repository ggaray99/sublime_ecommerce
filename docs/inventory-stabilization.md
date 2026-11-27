# Inventory stabilization (2026-11-27)

- **Approved by:** the owner, 2026-11-27.
- **Branch:** `feat/inventory-stabilization` (from `6185323`).
- **Base documents:** `docs/admin-inventory-audit.md` (audit and the 7 decisions) and `docs/admin-inventory-redesign.md`.

## 1. Writers audited (before the change)

| Writer | Problem found |
|---|---|
| `confirmPayment`, on time | The order was read without a lock, and the status update did not check the status again. If the reservation expired at that same moment, the order became **paid without discounting stock**. |
| `confirmPayment`, late | Two confirmations at once (for example the Mercado Pago notice plus the periodic check) could **discount the stock twice**. The sale had no link to its order. |
| `cancelOrder` | The status update did not check the status again: a cancel racing a late payment could cancel a paid order. |
| `recordCount` | The previous value was read without a lock. Counts racing sales or other counts could leave the sum of movements different from `on_hand`. "Reposición" accepted a decrease. |
| CSV import | It always recorded "Ajuste". |
| Expiry | It only ran when a page loaded. |

## 2. Changes by approved decision

### Decision 1: late payments (`8cb1f86`)

- **Traceable sale.** A late sale records "Venta con pago tardío · Pedido SUB-n". Inventory movements link it to its order through that note; the expired reservation is never reused.
- **Idempotent.** The late path locks the order row (`SELECT … FOR UPDATE`) and the update re-checks `status = 'expired'`. A second confirmation waits, finds the order paid and discounts nothing.
- **On time.** The update re-checks `status = 'pending_payment'`. If expiry won the race, the payment is recorded as a late payment, so it is neither lost nor counted twice.
- **`needs_review`** is unchanged: no stock, no stock change.
- **Cancel** re-checks its statuses under the lock.

### Decision 2: concurrent counts (`8cb1f86`)

- `recordCount` locks the variant's inventory row (`FOR UPDATE`). It computes the difference against that locked value and writes the stock, the movement and the audit entry in **one statement**. A failure rolls everything back, and going below the reserved units is refused by the CHECK with nothing written.
- A variant counted for the first time first gets a row with 0 units (no movement) so there is always a row to lock.
- This follows the code base's rule: every write is a single statement and no client is held across calls. **A single statement is a transaction** in PostgreSQL.

### Decision 3: restock (`8cb1f86`)

- "Reposición" only adds. A lower total is refused:
  - in `recordCount`, under the lock;
  - in the API `stock/bulk-count` (pre-check);
  - in the adjustment dialog;
  - in the product page stock form.
- To lower stock, use "Ajuste", which requires a note.
- "Contar el total" stays as an absolute count; with Reposición it must be at least the current stock.

### Decision 4: low stock — no change

The two indicators stay as they are, documented here:

| Indicator | Granularity | Rule | Products included |
|---|---|---|---|
| **Productos** list, filters, Inicio "Stock" card, Inventario summary cards | **Product**: the sum of active variants | "Sin stock" when available ≤ 0; "Stock bajo" when available is between 1 and the threshold (product `low_stock_threshold`, default 5) | All statuses |
| **Inventario** list, per row | **Variant** | Same thresholds as above, applied to the variant's own stock | Tracked variants (inactive ones only with the filter) |
| **Email alert** (`enqueueLowStock`, every minute) | **Variant** | Available ≤ threshold, 0 included. Sent once and re-armed when stock goes back above the threshold. | Published products, active variants |

### Decision 5: returns — not implemented

The functional specification is in `docs/returns-spec.md`. It covers full and partial returns, refunds without return, good / damaged / pending-inspection, movements and the model changes. Returned units never go back to sellable stock without inspection.

### Decision 6: imports (`938c1ad`)

- New optional column `motivo_stock`:
  - `reposicion` only adds;
  - `ajuste` adds or lowers;
  - empty keeps "ajuste", so older sheets import the same way.
- The preview shows the expected result, e.g. "stock 10 → 15 (+5, reposición)".
- Refused rows are reported and nothing is written for them. Each applied row is one locked count, with the same validation as before. A row never leaves stock without its movement.

### Decision 7: scheduled expiry (`55f1627`)

- **Infrastructure.** The VPS already runs `/etc/cron.d/sublime-outbox` every minute; it calls the protected internal route (`/api/internal/outbox`, `OUTBOX_TOKEN`, constant-time check) in the staging and store containers. No new cron or scheduler was added.
- **The run.** That route now calls `runScheduledExpiry` → `releaseExpired` first. It is idempotent and row-locked: only active, due reservations are released, with actor `system`.
- **Logging.** The result (`expiry: {reservations, orders}`) or the error goes to `/srv/sublime/outbox.log`. An error never stops the rest of the run.
- **Lock order.** `releaseExpired` now locks the pending orders first (`FOR UPDATE`, ordered by id), then their reservations, then inventory: the same order as `confirmPayment` and `cancelOrder`. This removes a pre-existing deadlock between a payment and the expiry, which the every-minute cron made more likely. A pending order whose payment is being confirmed waits, is then skipped, and the payment wins.
- **Complement.** `releaseExpired` keeps running from the panel, cart and checkout as before.
- **Store.** The store container only runs it when its database is enabled (`ordersAvailable`).

## 3. Migrations

**None.** Every change is code; the schema is unchanged. The late-sale link uses the note, as approved, not a new column; an `order_id` column on movements is listed in `docs/returns-spec.md` as a future change.

## 4. Contracts

- **API v1 `stock/bulk-count`.** A `restock` that would lower stock now returns the item as `failed` with `validation_failed` (path `items[i].reason`). That is the approved rule; the response shape is unchanged.
- **CSV.** The export is byte-identical, pinned by `tests/admin-export.test.mjs`. `motivo_stock` is accepted on import only (`IMPORT_ONLY_COLUMNS`), and sheets without it import as before.
- **Internal route.** It returns an `expiry` field in its JSON log.

## 5. Tests

| File | What it proves |
|---|---|
| `tests/inventory-stabilization.test.mjs` (14, PGlite) | Late sale names and links its order; repeated confirmations discount once; concurrent late confirmations discount once; `needs_review` unchanged; a payment that meets the expiry is recorded once; a count after a sale records the real difference; counts in a row; restock only adds; below reserved writes nothing; an equal count writes nothing; the ledger matches the stock; scheduled expiry is idempotent, touches only due reservations, uses actor `system` and reports errors |
| `tests/db-concurrency.test.mjs` (real PostgreSQL; **run 2026-11-27: 6/6 with 25 rounds and 6/6 with 60 rounds**, on a temporary `sublime_concurrency_test` database in the staging Postgres container, reached through an SSH tunnel; the database and role were dropped afterwards) | 3 simultaneous late confirmations; payment against two expiry runs; two expiry runs; 3 simultaneous counts; a count racing a sale and a reservation; restock against a sale, including a restock below the stock that must be refused under the lock. After every round, movements add up to `on_hand` and to `reserved`. It runs only with `CONCURRENCY_DATABASE_URL` pointing to a disposable `*concurrency_test` database: PGlite has a single connection and cannot reproduce real races. |
| `tests/admin-api.test.mjs` | `restock` decrease refused (dry run), `adjustment` with a note allowed |
| `tests/catalog-csv.test.mjs` | `reposicion` and `ajuste` rows, a refused decrease, an unknown reason, the preview text, recorded reasons, old sheets unchanged |
| `tests/admin-inventory-detail.test.mjs` | The dialog refuses a restock decrease and allows the same total with Ajuste |

## 6. Rules that remain unimplemented

- **Returns** (decision 5): specification only.
- **Low-stock definitions** (decision 4): unchanged by decision.
- **Late sales and coupons.** Observed in the orders rules: a late-paid order keeps its discount, but its coupon use is not counted again. Undecided.

## 7. Independent verification

**Verdict:** PASS on all 7 decisions, with no blockers.

The verifier's evidence:

- probes on PGlite;
- baseline-vs-HEAD differentials (CSV export and API `stock/bulk-count` responses byte-identical);
- an analysis of the row-lock order;
- an analysis of READ COMMITTED races.

What its advisories led to:

| Advisory | Outcome |
|---|---|
| **A1:** pre-existing deadlock between a payment and the expiry | Fixed with the lock order above |
| **A4:** the concurrency test never exercised the refusal under the lock | Added to the test |

**Remaining advisories, not changed:**

- **A2.** Statements locking several inventory rows follow the join order (pre-existing).
- **A3.** The API may report "updated" with a stale `before` when a concurrent write already set the same value. Cosmetic.
- **A5.** The movements listing joins late sales by the note. It is indexed and fine at the current size.

## 8. Risks

- **Reservations of a non-pending order.** `releaseExpired` now only expires reservations whose order is pending, or that have no order. An active reservation of an order in another status is not expected; it would be a data anomaly. Such a reservation would no longer be released by expiry.
- **The cron also runs in the store container.** Expiry runs there only when the store has its database enabled (today it does not).
- **Production is not touched.** The branch goes to QA only. The VPS cron already exists, so no infrastructure change is needed.
