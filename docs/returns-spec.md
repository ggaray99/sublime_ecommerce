# Returns and refunds: functional specification (not implemented)

- **Status:** a proposal for a later stage. The owner decided on 2026-11-27 not to implement it yet.
- **Base:** stock model in `docs/admin-inventory-audit.md`, rules in `docs/inventory-stabilization.md`.

## Why

Today a paid, shipped or delivered order cannot be cancelled, and nothing returns sold units to stock. A refund, or an item coming back, has to be handled outside the panel, and inventory does not reflect it.

## Principle

**A physical return never increases sellable stock on its own.**

- A returned unit first enters as "pending inspection" and does not count as available.
- Only an inspection marked "good condition" returns it to `on_hand`.
- A damaged unit is recorded but never becomes sellable.

## Cases to cover

| Case | Money | Physical units | Effect on sellable stock |
|---|---|---|---|
| **Full return** of a paid, shipped or delivered order | Full refund | All units come back | Only after inspection, per unit |
| **Partial return** (some lines or some units) | Refund of the returned lines | Only those units come back | As above, per returned unit |
| **Refund without return** (goodwill, delay, the `needs_review` case) | Full or partial refund | Nothing comes back | None |
| **Received in good condition** | — | Inspected, OK | `on_hand += n` ("devolución apta") |
| **Damaged** | — | Inspected, not sellable | None; a "devolución dañada" record (optionally a write-off count) |
| **Pending inspection** | — | Received, not inspected | None until inspected; visible as "en inspección" |

Every return references the **original order** and its lines: SKU, quantity and unit price at the time of sale. It is never possible to return more units than were sold, minus units already returned.

## Order states

The order keeps its delivery status. A new, separate **return state** is shown next to payment and delivery, using the same derived-view approach as `status-view.ts`:

- *Sin devolución*
- *Devolución solicitada*
- *Recibida, en inspección*
- *Devuelta parcialmente*
- *Devuelta*
- *Reembolsado sin devolución*

The payment view gets *Reembolsado* / *Reembolsado parcialmente*.

## Inventory movements

New ledger reasons, added to the `inventory_movements.reason` CHECK:

| Reason | `delta_on_hand` | When |
|---|---|---|
| `return_received` | 0 | Units arrive (pending inspection; tracked in the return record, not in sellable stock) |
| `return_restocked` | +n | Inspection OK: units go back to sellable stock |
| `return_damaged` | 0 | Inspection not OK: kept as a record, never sellable |

Rules for these movements:

- Each movement carries the order (`reservation_id` does not apply), so the movement can be traced like the late sales: an order reference column is preferable to a note (see the model changes).
- Writes are one row-locked statement, with the same pattern as `recordCount` (`docs/inventory-stabilization.md`, 2).

## Possible data model changes (each needs a migration and approval)

1. A new **`order_returns`** table: id, order_id, status (`requested`, `received`, `inspected`, `closed`), refund_minor, refund_method, reason, created_by, timestamps.
2. A new **`order_return_items`** table: return_id, order_item_id, quantity, condition (`pending`, `good`, `damaged`), inspected_by, inspected_at. CHECK: the quantity returned per order item never exceeds the quantity sold.
3. **`inventory_movements`:** the new reasons above, plus an optional `order_id` column. This would also replace the "Pedido SUB-n" note of late sales with a real link.
4. **Refunds:** a `refunds` table (amount, method, external Mercado Pago id when refunded through it) or a status on `payments`. Mercado Pago refunds would go through its API, which is a separate integration decision.
5. **`audit_logs`:** a `return` entity (CHECK update).

## Permissions and audit

- Owners and editors can register returns, the same as order actions today.
- Refunds through Mercado Pago could be owner-only (to decide).
- Every step writes an order event (Timeline) and an audit entry.

## Open questions for the owner

- **Return window:** does it close a number of days after delivery?
- **Shipping costs** on refunds: refunded or not?
- **Coupon usage** on a returned order: given back or not?
- **Who inspects,** and whether inspection can be skipped for unopened items.
- **Refund through Mercado Pago from the panel,** or recorded manually only?
