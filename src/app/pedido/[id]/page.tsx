import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClearCart } from "@/components/cart/clear-cart";
import { argentinaTime, OrderSummary } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { getCurrentCustomer } from "@/server/customers/session";
import { orderNumber, type OrderDetail } from "@/server/orders/repository";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { SubmitButton } from "@/components/submit-button";
import { canPayOnline } from "@/server/payments/checkout";
import { getMercadoPago } from "@/server/payments/session";
import { payWithMercadoPagoAction } from "./actions";

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
  // The URL carries the private token: never send it to other sites.
  referrer: "no-referrer",
};

type Props = PageProps<"/pedido/[id]">;
type Notice = { ok: boolean; text: string };

const PAYMENT_NOTICES: Record<string, Notice> = {
  not_payable: { ok: false, text: "Este pedido ya no se puede pagar online (ya se pagó, venció o se coordina por transferencia)." },
  not_connected: { ok: false, text: "El pago online no está disponible en este momento. Te vamos a escribir para coordinar el pago." },
  unavailable: { ok: false, text: "No pudimos abrir Mercado Pago. Probá de nuevo en unos segundos." },
};

/** Mercado Pago's return (back_urls): the webhook confirms the order, usually within seconds. */
const RETURN_NOTICES: Record<string, Notice> = {
  approved: { ok: true, text: "Mercado Pago aprobó tu pago. Estamos confirmando el pedido: actualizá la página en unos segundos." },
  in_process: { ok: true, text: "Tu pago está en revisión en Mercado Pago. Te avisamos apenas se acredite." },
  pending: { ok: true, text: "Tu pago quedó pendiente en Mercado Pago. Te avisamos apenas se acredite." },
  rejected: { ok: false, text: "Mercado Pago rechazó el pago. Podés intentarlo de nuevo con otro medio." },
  null: { ok: false, text: "No se completó el pago. Podés intentarlo de nuevo antes de que venza la reserva." },
};

/**
 * Visible with the private link (?t=token) or to the signed-in customer who placed it.
 * Anyone else gets a 404, so order ids reveal nothing.
 */
async function OrderPage({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  await connection();
  if (!ordersAvailable()) notFound();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.t === "string" ? query.t : "";
  const repo = getOrderRepository();
  await repo.releaseExpired();

  let order: OrderDetail | null = await repo.getOrderByToken(id, token);
  if (!order) {
    const customer = await getCurrentCustomer().catch(() => null);
    const candidate = customer ? await repo.getOrder(id).catch(() => null) : null;
    order = candidate && customer && candidate.customerId === customer.id ? candidate : null;
  }
  if (!order) notFound();

  const mercadoPago = canPayOnline(order) ? getMercadoPago() : null;
  const payOnline = Boolean(mercadoPago && (mercadoPago.config.serverAccessToken || (await mercadoPago.accounts.get())));
  // ?pago= from the pay action; ?status= when Mercado Pago sends the customer back.
  const paymentNotice = PAYMENT_NOTICES[String(query.pago ?? "")] ?? (order.status === "pending_payment" ? RETURN_NOTICES[String(query.status ?? "")] : undefined);

  return (
    <div className="account">
      {query.nuevo && <ClearCart />}
      <section className="account__section" aria-labelledby="pedido-title">
        <h2 id="pedido-title">{query.nuevo ? `¡Recibimos tu pedido ${orderNumber(order)}!` : `Pedido ${orderNumber(order)}`}</h2>
        {paymentNotice && (
          <p className={paymentNotice.ok ? "panel panel--muted" : "form-alert"} role={paymentNotice.ok ? "status" : "alert"}>
            {paymentNotice.text}
          </p>
        )}
        {order.status === "pending_payment" && (
          <div className="panel panel--muted" role="status">
            <p>
              <strong>Reservamos el stock hasta las {argentinaTime(order.expiresAt).split(" ")[1]} (hora de Argentina).</strong>{" "}
              {payOnline ? "Pagalo ahora con Mercado Pago: tarjeta, dinero en cuenta o Mercado Crédito." : `Te vamos a escribir a ${order.contactEmail} para coordinar el pago.`}
            </p>
            {payOnline && (
              <form action={payWithMercadoPagoAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="t" value={token} />
                <SubmitButton className="btn btn--violet btn--lg" pendingLabel="Abriendo Mercado Pago…">
                  Pagar con Mercado Pago
                </SubmitButton>
              </form>
            )}
            <p className="muted">Si la reserva vence sin pago confirmado, el pedido queda vencido y el stock se libera.</p>
          </div>
        )}
        {order.status === "expired" && (
          <p className="form-alert" role="status">
            La reserva venció sin pago confirmado. Si ya pagaste, escribinos: revisamos el stock disponible.
          </p>
        )}
        <OrderSummary order={order} />
        <p className="muted">
          Guardá este enlace para volver a ver tu pedido. {order.customerId ? "También lo ves en Mi cuenta." : ""}
        </p>
        <div className="actions">
          <Link className="btn btn--ghost" href="/tienda">
            Seguir comprando
          </Link>
          {order.customerId && (
            <Link className="btn btn--coal" href="/cuenta">
              Ir a Mi cuenta
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

export default function PedidoPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Pedido" title="TU PEDIDO." tone="light">
        <p>El estado de tu pedido y el seguimiento del envío.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el pedido…</p>}>
        <OrderPage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
