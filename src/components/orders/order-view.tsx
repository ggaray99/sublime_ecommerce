import { formatPrice } from "@/lib/format";
import { orderNumber, orderTotalMinor, type OrderDetail, type OrderStatus } from "@/server/orders/repository";
import { etaLabel } from "@/server/shipping/rules";

export const orderStatusLabel: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pago confirmado",
  shipped: "Enviado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
  needs_review: "En revisión",
};

/** Argentina has no DST: UTC−3 all year. */
export const argentinaTime = (date: Date) => {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const [day, time] = local.toISOString().split("T");
  return `${day.split("-").reverse().join("/")} ${time.slice(0, 5)}`;
};

const optionsText = (options: Record<string, string>) =>
  Object.entries(options)
    .map(([name, value]) => `${name} ${value}`)
    .join(" · ");

/** Order summary shared by the customer confirmation page and the admin. */
export function OrderSummary({ order }: { order: OrderDetail }) {
  const shipping = order.delivery.method === "shipping" ? order.delivery.address : null;
  return (
    <div className="order-summary">
      <dl className="order-facts">
        <div>
          <dt>Pedido</dt>
          <dd>{orderNumber(order)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className={`badge order-status order-status--${order.status}`}>{orderStatusLabel[order.status]}</span>
          </dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{argentinaTime(order.createdAt)}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>
            {shipping ? (
              <>
                Envío a {shipping.recipient}: {shipping.street} {shipping.streetNumber}
                {shipping.apartment && `, ${shipping.apartment}`}, {shipping.city}, {shipping.province} ({shipping.postalCode})
                {shipping.notes && ` · ${shipping.notes}`}
              </>
            ) : (
              "Retiro en el taller"
            )}
            {order.shipping?.method === "shipping" && order.shipping.etaMaxDays !== null && (
              <span className="muted">
                {" "}
                · {order.shipping.label}, {etaLabel(order.shipping.etaMinDays ?? 0, order.shipping.etaMaxDays)} desde que se despacha
              </span>
            )}
          </dd>
        </div>
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
                    Seguir el envío
                  </a>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      <table className="admin-table order-items">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Precio</th>
            <th scope="col">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.sku}>
              <th scope="row">
                {item.name}
                <span className="muted"> · {item.sku}</span>
                {Object.keys(item.options).length > 0 && !item.name.includes("·") && <span className="muted"> · {optionsText(item.options)}</span>}
              </th>
              <td>{item.quantity}</td>
              <td>{formatPrice(item.unitPriceMinor / 100)}</td>
              <td>{formatPrice(item.lineTotalMinor / 100)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Productos
            </th>
            <td>{formatPrice(order.subtotalMinor / 100)}</td>
          </tr>
          {order.promotions
            .filter((promotion) => promotion.amountMinor > 0)
            .map((promotion) => (
              <tr key={promotion.promotionId} className="order-items__discount">
                <th scope="row" colSpan={3}>
                  {promotion.name}
                  {promotion.coupon && ` (cupón ${promotion.coupon})`}
                </th>
                <td>−{formatPrice(promotion.amountMinor / 100)}</td>
              </tr>
            ))}
          <tr>
            <th scope="row" colSpan={3}>
              Envío
            </th>
            <td>
              {order.shippingMinor === null
                ? shipping
                  ? "A confirmar"
                  : "Sin cargo"
                : order.shippingMinor === 0
                  ? order.shipping?.free
                    ? "Gratis"
                    : "Sin cargo"
                  : formatPrice(order.shippingMinor / 100)}
            </td>
          </tr>
          <tr className="order-items__total">
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td>{formatPrice(orderTotalMinor(order) / 100)}</td>
          </tr>
        </tfoot>
      </table>
      {order.paymentPreference === "transfer" && <p className="muted">Pago elegido: transferencia o efectivo.</p>}
      {order.notes && <p className="muted">Comentarios: {order.notes}</p>}
    </div>
  );
}
