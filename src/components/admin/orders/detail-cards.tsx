import Link from "next/link";
import { Badge, Card, Timeline, VisuallyHidden } from "@/components/admin/ui";
import { DesignLineMockup } from "@/components/orders/design-line-mockup";
import { orderStatusLabel, type OrderMockups } from "@/components/orders/order-view";
import { formatPrice } from "@/lib/format";
import { orderTotalMinor, type OrderDetail } from "@/server/orders/repository";
import type { OrderPayment } from "@/server/orders/payments-view";
import { DELIVERY_STATE, orderDeliveryState, orderPaymentState, PAYMENT_STATE } from "@/server/orders/status-view";
import { etaLabel } from "@/server/shipping/rules";
import {
  argentinaDateTime,
  lineOptionsText,
  mercadoPagoStatusLabel,
  mercadoPagoStatusTone,
  orderTimelineEntries,
  PAYMENT_EXPLANATION,
  paymentPreferenceLabel,
  reservationText,
  shippingCostLabel,
} from "./detail-helpers";
import styles from "./detail.module.css";

const price = (minor: number) => formatPrice(minor / 100);

/** A date in Argentina time inside a <time> element. */
export function ArgentinaTime({ date }: { date: Date }) {
  return <time dateTime={date.toISOString()}>{argentinaDateTime(date)}</time>;
}

/** Lines (name, options, SKU, design), quantities and prices, then discounts, shipping and total. */
export function OrderProductsCard({ order, mockups }: { order: OrderDetail; mockups?: OrderMockups }) {
  const shippingLabel = shippingCostLabel(order);
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Card section id="productos" title="Productos" actions={<span className={styles.muted}>{units === 1 ? "1 unidad" : `${units} unidades`}</span>}>
      <ul className={styles.lines}>
        {order.items.map((item, index) => {
          const options = lineOptionsText(item);
          return (
            <li key={`${item.sku}-${index}`} className={styles.line}>
              <div className={styles.lineInfo}>
                <p className={styles.lineName}>{item.name}</p>
                {options && <p className={styles.muted}>{options}</p>}
                <p className={styles.muted}>SKU {item.sku}</p>
                {(item.designName || item.designId) && (
                  <p className={styles.text}>
                    {item.designName && <>Diseño: {item.designName}</>}
                    {item.designName && item.designId && " · "}
                    {item.designId && <a href={`/admin/disenos/${item.designId}/archivo`}>Archivo para producción</a>}
                  </p>
                )}
                {item.designId && item.designPlacement && (
                  <DesignLineMockup
                    item={{ ...item, designPlacement: item.designPlacement }}
                    art={mockups?.art[item.designId]}
                    overrides={mockups?.overrides ?? {}}
                    downloadName={`pedido-${order.number}-${mockups?.art[item.designId]?.slug ?? `linea-${index + 1}`}.jpg`}
                  />
                )}
              </div>
              <div className={styles.linePrice}>
                <span className={styles.muted}>
                  {item.quantity} × {price(item.unitPriceMinor)}
                </span>
                <span className={styles.amount}>{price(item.lineTotalMinor)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <dl className={styles.totals}>
        <div>
          <dt>Subtotal</dt>
          <dd>{price(order.subtotalMinor)}</dd>
        </div>
        {order.promotions
          .filter((promotion) => promotion.amountMinor > 0)
          .map((promotion) => (
            <div key={promotion.promotionId}>
              <dt>
                {promotion.name}
                {promotion.coupon && ` (cupón ${promotion.coupon})`}
              </dt>
              <dd>−{price(promotion.amountMinor)}</dd>
            </div>
          ))}
        <div>
          <dt>Envío</dt>
          <dd>{shippingLabel ?? price(order.shippingMinor ?? 0)}</dd>
        </div>
        <div className={styles.total}>
          <dt>Total</dt>
          <dd>{price(orderTotalMinor(order))}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** Method, address or pickup, the quote frozen at checkout, and tracking. */
export function OrderDeliveryCard({ order }: { order: OrderDetail }) {
  const state = DELIVERY_STATE[orderDeliveryState(order.status, order.delivery.method)];
  const address = order.delivery.method === "shipping" ? order.delivery.address : null;
  const quote = order.shipping?.method === "shipping" ? order.shipping : null;
  return (
    <Card section id="entrega" title="Entrega" actions={<Badge tone={state.tone}>{state.label}</Badge>}>
      <dl className={styles.facts}>
        <div>
          <dt>Método</dt>
          <dd>{address ? "Envío a domicilio" : "Retiro en el taller"}</dd>
        </div>
        {address && (
          <div>
            <dt>Dirección</dt>
            <dd>
              <address className={styles.address}>
                {address.recipient}
                <br />
                {address.street} {address.streetNumber}
                {address.apartment && `, ${address.apartment}`}
                <br />
                {address.city}, {address.province} ({address.postalCode})
              </address>
              {address.notes && <p className={styles.muted}>Indicaciones: {address.notes}</p>}
            </dd>
          </div>
        )}
        {quote && (
          <div>
            <dt>Tarifa</dt>
            <dd>
              {quote.label}
              {quote.etaMaxDays !== null && (
                <span className={styles.muted}>
                  {" "}
                  · {etaLabel(quote.etaMinDays ?? 0, quote.etaMaxDays)} desde que se despacha
                </span>
              )}
            </dd>
          </div>
        )}
        {order.tracking && (
          <div>
            <dt>Seguimiento</dt>
            <dd>
              {order.tracking.carrier}
              {order.tracking.code && ` · ${order.tracking.code}`}
              {order.tracking.url && (
                <>
                  {" · "}
                  <a href={order.tracking.url} target="_blank" rel="noopener noreferrer">
                    Seguir el envío<VisuallyHidden> (se abre en otra pestaña)</VisuallyHidden>
                  </a>
                </>
              )}
              {order.shippedAt && (
                <span className={styles.muted}>
                  {" "}
                  · enviado el <ArgentinaTime date={order.shippedAt} />
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

/** Payment state and what it means, the customer's preference and the Mercado Pago payments (read-only). */
export function OrderPaymentCard({ order, payments }: { order: OrderDetail; payments: OrderPayment[] }) {
  const paymentState = orderPaymentState(order.status);
  const state = PAYMENT_STATE[paymentState];
  return (
    <Card section id="pago" title="Pago" actions={<Badge tone={state.tone}>{state.label}</Badge>}>
      {order.status === "needs_review" ? (
        <div className={styles.callout} role="note">
          <p className={styles.calloutTitle}>Pago recibido sin stock suficiente</p>
          <p className={styles.text}>
            El cliente pagó después de que venció la reserva y ya no alcanzaba el stock. Definí con el cliente reposición, demora o devolución. Hoy la única acción
            disponible en el panel es cancelar el pedido.
          </p>
        </div>
      ) : (
        <p className={styles.text}>{PAYMENT_EXPLANATION[paymentState]}</p>
      )}
      {order.status === "pending_payment" && (
        <p className={styles.text}>
          <strong>{reservationText(order.expiresAt)}</strong> <span className={styles.muted}>(hora de Argentina). Si no se confirma el pago, vence sola.</span>
        </p>
      )}
      <dl className={styles.facts}>
        <div>
          <dt>Medio elegido</dt>
          <dd>{paymentPreferenceLabel(order.paymentPreference)}</dd>
        </div>
        <div>
          <dt>Total del pedido</dt>
          <dd>{price(orderTotalMinor(order))}</dd>
        </div>
      </dl>
      <div className={styles.block}>
        <h3 className={styles.subtitle}>Mercado Pago</h3>
        {payments.length ? (
          <ul className={styles.payments}>
            {payments.map((payment) => (
              <li key={payment.externalId}>
                <div className={styles.paymentRow}>
                  <Badge tone={mercadoPagoStatusTone(payment.status)}>{mercadoPagoStatusLabel(payment.status)}</Badge>
                  <span className={styles.amount}>
                    {price(payment.amountMinor)}
                    {payment.currency && payment.currency !== "ARS" && ` ${payment.currency}`}
                  </span>
                </div>
                <p className={styles.meta}>
                  <ArgentinaTime date={payment.createdAt} /> · ID <code className={styles.code}>{payment.externalId}</code>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Sin pagos registrados en Mercado Pago.</p>
        )}
      </div>
    </Card>
  );
}

/** Contact details with mailto:/tel: links, account or guest, and the customer's notes. */
export function OrderCustomerCard({ order }: { order: OrderDetail }) {
  const phone = order.contactPhone.replace(/[^\d+]/g, "");
  return (
    <Card section id="cliente" title="Cliente">
      <div className={styles.stack}>
        <p className={styles.text}>{order.contactName}</p>
        <p className={styles.text}>
          <a href={`mailto:${order.contactEmail}`}>{order.contactEmail}</a>
        </p>
        {order.contactPhone && (
          <p className={styles.text}>{phone ? <a href={`tel:${phone}`}>{order.contactPhone}</a> : order.contactPhone}</p>
        )}
        <p className={styles.text}>
          {order.customerId ? <Link href={`/admin/clientes/${order.customerId}`}>Cliente con cuenta</Link> : <span className={styles.muted}>Compra como invitado</span>}
        </p>
      </div>
      {order.notes && (
        <div className={styles.block}>
          <h3 className={styles.subtitle}>Comentarios del cliente</h3>
          <p className={styles.text}>{order.notes}</p>
        </div>
      )}
    </Card>
  );
}

/** Status changes, newest first. */
export function OrderHistoryCard({ order }: { order: OrderDetail }) {
  const entries = orderTimelineEntries(order.events, order.delivery.method, orderStatusLabel);
  return (
    <Card section id="historial" title="Historial">
      <Timeline
        label="Historial del pedido"
        formatTime={argentinaDateTime}
        items={entries.map((entry) => ({
          id: entry.id,
          title: (
            <>
              {entry.label}
              {entry.previousLabel && <span className={styles.previous}> · antes: {entry.previousLabel}</span>}
            </>
          ),
          description: entry.note || undefined,
          meta: entry.actor,
          time: entry.time,
          tone: entry.tone,
        }))}
      />
    </Card>
  );
}
