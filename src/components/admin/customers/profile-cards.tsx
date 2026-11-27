import Link from "next/link";
import { ArgentinaTime } from "@/components/admin/orders/detail-cards";
import { argentinaDateTime } from "@/components/admin/orders/detail-helpers";
import detail from "@/components/admin/orders/detail.module.css";
import { Badge, Card, DataTable, EmptyState, Timeline, VisuallyHidden, type DataTableColumn } from "@/components/admin/ui";
import { orderStatusLabel } from "@/components/orders/order-view";
import { requestStatusLabel } from "@/components/requests/request-view";
import { formatPrice } from "@/lib/format";
import { requestNumber, type CustomRequest } from "@/server/custom-requests/repository";
import type { CustomerSummary } from "@/server/customers/admin";
import type { CustomerActivityEvent, GuestOrderMatch, GuestRequestMatch } from "@/server/customers/profile";
import type { Address } from "@/server/customers/repository";
import { orderNumber, orderTotalMinor, type Order, type OrderStatus } from "@/server/orders/repository";
import { DELIVERY_STATE, orderDeliveryState, orderPaymentState, PAYMENT_STATE } from "@/server/orders/status-view";
import { activityTimelineEntries, argentinaDate, contactDiffers, phoneHref, requestStatusTone, reviewCountText } from "./profile-helpers";
import styles from "./profile.module.css";

const price = (minor: number) => formatPrice(minor / 100);
const requestLabel = (status: string) => requestStatusLabel[status as keyof typeof requestStatusLabel] ?? status;

/** Payment badge, plus the delivery badge when delivery applies. */
function OrderBadges({ status, method }: { status: OrderStatus; method: Order["delivery"]["method"] }) {
  const payment = PAYMENT_STATE[orderPaymentState(status)];
  const deliveryState = orderDeliveryState(status, method);
  const delivery = DELIVERY_STATE[deliveryState];
  return (
    <span className={styles.badges}>
      <Badge tone={payment.tone}>
        <VisuallyHidden>Pago: </VisuallyHidden>
        {payment.label}
      </Badge>
      {deliveryState !== "none" && (
        <Badge tone={delivery.tone}>
          <VisuallyHidden>Entrega: </VisuallyHidden>
          {delivery.label}
        </Badge>
      )}
    </span>
  );
}

/** Only reliable numbers (docs/admin-customers-audit.md): no averages, nothing from guest records. */
export function CustomerMetricsCard({ customer, reviewCount }: { customer: CustomerSummary; reviewCount: number }) {
  const review = reviewCountText(reviewCount);
  return (
    <Card section id="metricas" title="Métricas">
      <dl className={styles.metrics}>
        <div>
          <dt>Pedidos</dt>
          <dd>{customer.orderCount}</dd>
        </div>
        <div>
          <dt>Pagados</dt>
          <dd>{customer.paidOrderCount}</dd>
        </div>
        <div>
          <dt>Total pagado</dt>
          <dd>{price(customer.spentMinor)}</dd>
          <dd className={styles.metricNote}>pedidos pagados, enviados y entregados</dd>
        </div>
        <div>
          <dt>Último pedido</dt>
          <dd>{customer.lastOrderAt ? <time dateTime={customer.lastOrderAt.toISOString()}>{argentinaDate(customer.lastOrderAt)}</time> : "Sin pedidos"}</dd>
        </div>
        <div>
          <dt>Encargos</dt>
          <dd>{customer.requestCount}</dd>
        </div>
      </dl>
      {review && (
        <p className={styles.reviewNote}>
          <Badge tone="critical">{review}</Badge>
          <span className={detail.muted}>Pagos recibidos sin stock suficiente: pueden terminar en devolución.</span>
        </p>
      )}
    </Card>
  );
}

const ORDER_COLUMNS: DataTableColumn<Order>[] = [
  { key: "number", header: "Pedido", cell: (order) => orderNumber(order), nowrap: true, rowHeader: true },
  { key: "date", header: "Fecha", cell: (order) => <time dateTime={order.createdAt.toISOString()}>{argentinaDate(order.createdAt)}</time>, nowrap: true },
  { key: "status", header: "Estado", cell: (order) => <OrderBadges status={order.status} method={order.delivery.method} /> },
  { key: "total", header: "Total", cell: (order) => price(orderTotalMinor(order)), align: "end", nowrap: true },
];

/** The account's orders, newest first; the full list lives in Pedidos. */
export function CustomerOrdersCard({ orders, total, email }: { orders: Order[]; total: number; email: string }) {
  const more = total > orders.length;
  return (
    <Card
      section
      id="pedidos"
      title="Pedidos"
      padding={orders.length ? "none" : "md"}
      actions={orders.length ? <Link className={styles.cardLink} href={`/admin/pedidos?q=${encodeURIComponent(email)}`}>Ver todos en Pedidos</Link> : undefined}
    >
      {orders.length ? (
        <>
          <DataTable caption="Pedidos de la cuenta" captionHidden columns={ORDER_COLUMNS} rows={orders} rowKey={(order) => order.id} rowHref={(order) => `/admin/pedidos/${order.id}`} />
          {more && <p className={styles.tableNote}>Se muestran los {orders.length} más recientes de {total}.</p>}
        </>
      ) : (
        <EmptyState heading="Sin pedidos con esta cuenta" headingLevel={3}>
          Los pedidos hechos como invitado no se vinculan a la cuenta.
        </EmptyState>
      )}
    </Card>
  );
}

/** Encargos owned by the account (customer_id), with the contact that was typed in each one. */
export function CustomerRequestsCard({ requests, accountEmail, total }: { requests: CustomRequest[]; accountEmail: string; total: number }) {
  const anyDiffers = requests.some((request) => contactDiffers(request.contactEmail, accountEmail));
  return (
    <Card section id="encargos" title="Encargos">
      {requests.length ? (
        <>
          {anyDiffers && (
            <p className={detail.muted}>
              El encargo pertenece a esta cuenta porque se envió con la sesión iniciada; los datos de contacto los escribió quien lo pidió.
            </p>
          )}
          <ul className={styles.records}>
            {requests.map((request) => {
              const differs = contactDiffers(request.contactEmail, accountEmail);
              return (
                <li key={request.id} className={styles.record}>
                  <div className={styles.recordHead}>
                    <Link className={styles.recordLink} href={`/admin/encargos/${request.id}`}>
                      {requestNumber(request)}
                    </Link>
                    <Badge tone={requestStatusTone(request.status)}>{requestLabel(request.status)}</Badge>
                    {differs && <Badge tone="warning">Contacto distinto</Badge>}
                  </div>
                  <p className={detail.text}>
                    {request.productType} · {request.quantity} {request.quantity === 1 ? "unidad" : "unidades"}
                  </p>
                  <p className={detail.meta}>
                    <ArgentinaTime date={request.createdAt} /> · Contacto: {request.contactName} · {request.contactEmail}
                  </p>
                </li>
              );
            })}
          </ul>
          {total > requests.length && <p className={detail.meta}>Se muestran los {requests.length} más recientes de {total}.</p>}
        </>
      ) : (
        <EmptyState heading="Sin encargos con esta cuenta" headingLevel={3}>
          Los encargos enviados sin iniciar sesión no se vinculan a la cuenta.
        </EmptyState>
      )}
    </Card>
  );
}

/** Latest status changes of the account's orders and encargos (read-only). */
export function CustomerActivityCard({ events }: { events: CustomerActivityEvent[] }) {
  const entries = activityTimelineEntries(events, { order: orderStatusLabel, request: requestStatusLabel });
  return (
    <Card section id="actividad" title="Actividad reciente">
      <Timeline
        label="Actividad reciente de pedidos y encargos"
        formatTime={argentinaDateTime}
        empty="Sin actividad registrada en sus pedidos ni encargos."
        items={entries.map((entry) => ({
          id: entry.id,
          title: (
            <Link className={styles.recordLink} href={entry.href}>
              {entry.code} · {entry.label}
            </Link>
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

/** Guest records typed with the account email: shown apart, never linked, merged or counted. */
export function CustomerGuestMatchesCard({ orders, requests }: { orders: GuestOrderMatch[]; requests: GuestRequestMatch[] }) {
  if (!orders.length && !requests.length) return null;
  return (
    <Card section id="mismo-email" title="Con el mismo email, sin cuenta">
      <p className={detail.muted}>Compras como invitado con el mismo email. No están vinculadas a la cuenta ni se suman a sus métricas.</p>
      <ul className={styles.records}>
        {orders.map((order) => {
          const status = order.status as OrderStatus;
          const payment = PAYMENT_STATE[orderPaymentState(status)] ?? { label: order.status, tone: "neutral" as const };
          return (
            <li key={order.id} className={styles.record}>
              <div className={styles.recordHead}>
                <Link className={styles.recordLink} href={`/admin/pedidos/${order.id}`}>
                  SUB-{order.number}
                </Link>
                <Badge tone={payment.tone}>
                  <VisuallyHidden>Pago: </VisuallyHidden>
                  {payment.label}
                </Badge>
                <span className={styles.amount}>{price(order.totalMinor)}</span>
              </div>
              <p className={detail.meta}>
                Pedido · <ArgentinaTime date={order.createdAt} /> · {order.contactName}
              </p>
            </li>
          );
        })}
        {requests.map((request) => (
          <li key={request.id} className={styles.record}>
            <div className={styles.recordHead}>
              <Link className={styles.recordLink} href={`/admin/encargos/${request.id}`}>
                ENC-{request.number}
              </Link>
              <Badge tone={requestStatusTone(request.status)}>{requestLabel(request.status)}</Badge>
            </div>
            <p className={detail.meta}>
              Encargo · <ArgentinaTime date={request.createdAt} /> · {request.productType} · {request.contactName}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Email, phone, sign-up, last session and whether Mi cuenta was opened. */
export function CustomerContactCard({ customer }: { customer: CustomerSummary }) {
  const tel = phoneHref(customer.phone);
  return (
    <Card section id="contacto" title="Contacto">
      <dl className={detail.facts}>
        <div>
          <dt>Email</dt>
          <dd>
            <a className={styles.textLink} href={`mailto:${customer.email}`}>
              {customer.email}
            </a>
          </dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>
            {customer.phone ? (
              tel ? (
                <a className={styles.textLink} href={tel}>
                  {customer.phone}
                </a>
              ) : (
                customer.phone
              )
            ) : (
              <span className={detail.muted}>Sin teléfono</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Cuenta creada</dt>
          <dd>
            <ArgentinaTime date={customer.createdAt} />
          </dd>
        </div>
        <div>
          <dt>Última sesión</dt>
          <dd>{customer.lastSeenAt ? <ArgentinaTime date={customer.lastSeenAt} /> : <span className={detail.muted}>Sin sesiones registradas</span>}</dd>
        </div>
        <div>
          <dt>Mi cuenta</dt>
          <dd>
            {customer.customerId ? (
              "Abierta"
            ) : (
              <>
                Todavía no la abrió
                <span className={styles.factNote}>
                  Se registró pero nunca entró a Mi cuenta ni al checkout con la sesión iniciada: no tiene datos, direcciones, pedidos ni encargos con su cuenta.
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** Saved addresses, read-only: the customer manages them from Mi cuenta. */
export function CustomerAddressesCard({ addresses }: { addresses: Address[] }) {
  return (
    <Card section id="direcciones" title="Direcciones">
      {addresses.length ? (
        <ul className={styles.records}>
          {addresses.map((address) => (
            <li key={address.id} className={styles.record}>
              <div className={styles.recordHead}>
                <span className={styles.recordTitle}>{address.label || "Dirección"}</span>
                {address.isDefault && <Badge tone="success">Predeterminada</Badge>}
              </div>
              <address className={styles.address}>
                {address.recipient}
                <br />
                {address.street} {address.streetNumber}
                {address.apartment && `, ${address.apartment}`}
                <br />
                {address.city}, {address.province} ({address.postalCode})
              </address>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState heading="Sin direcciones guardadas" headingLevel={3} />
      )}
      <p className={detail.meta}>El cliente las administra desde Mi cuenta.</p>
    </Card>
  );
}
