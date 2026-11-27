import type { RequestStatus } from "../../../server/custom-requests/repository.ts";
import type { CustomerActivityEvent } from "../../../server/customers/profile.ts";
import type { StateTone } from "../../../server/orders/status-view.ts";
import { actorLabel, argentinaDateTime, eventTone } from "../orders/detail-helpers.ts";

/*
 * Pure rules of the admin customer profile page (tested in
 * tests/admin-customer-profile.test.mjs). Display only: the profile never
 * links, merges or changes customers, orders or encargos.
 */

/** An encargo's typed contact email is not the account's (the account owns it because the session was signed in). */
export const contactDiffers = (contactEmail: string, accountEmail: string): boolean =>
  contactEmail.trim().toLowerCase() !== accountEmail.trim().toLowerCase();

/** needs_review orders are money received that may be refunded: shown apart, never added to "Total pagado". */
export function reviewCountText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 pago en revisión (no sumado)" : `${count} pagos en revisión (no sumados)`;
}

/** "dd/mm/aaaa" in Argentina time. */
export const argentinaDate = (date: Date): string => argentinaDateTime(date).split(" ")[0];

/** A tel: link from a typed phone, or null when it has no digits. */
export function phoneHref(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return /\d/.test(digits) ? `tel:${digits}` : null;
}

const REQUEST_TONE: Record<RequestStatus, StateTone> = {
  received: "attention",
  quoted: "info",
  accepted: "success",
  declined: "neutral",
  in_production: "info",
  delivered: "success",
  cancelled: "neutral",
};

/** Badge tone of an encargo status; unknown values are neutral. */
export const requestStatusTone = (status: string): StateTone => REQUEST_TONE[status as RequestStatus] ?? "neutral";

const ACTORS: Record<string, string> = { cliente: "Cliente" };

export type ActivityEntry = {
  id: string;
  /** SUB-n or ENC-n. */
  code: string;
  label: string;
  href: string;
  actor: string;
  note: string;
  time: Date;
  tone: StateTone;
};

/** Order and encargo events as Timeline entries, in the given order (the query returns them newest first). */
export function activityTimelineEntries(
  events: readonly CustomerActivityEvent[],
  labels: { order: Record<string, string>; request: Record<string, string> },
): ActivityEntry[] {
  return events.map((event, index) => {
    const order = event.kind === "order";
    return {
      id: `${event.kind}-${event.recordId}-${index}`,
      code: order ? `SUB-${event.number}` : `ENC-${event.number}`,
      label: (order ? labels.order : labels.request)[event.toStatus] ?? event.toStatus,
      href: order ? `/admin/pedidos/${event.recordId}` : `/admin/encargos/${event.recordId}`,
      actor: ACTORS[event.actor] ?? actorLabel(event.actor),
      note: event.note,
      time: event.createdAt,
      tone: order ? eventTone(event.toStatus, event.method ?? "pickup") : requestStatusTone(event.toStatus),
    };
  });
}
