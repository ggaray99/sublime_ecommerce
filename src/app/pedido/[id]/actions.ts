"use server";

import { notFound, redirect } from "next/navigation";
import { site } from "@/data/site";
import { getCurrentCustomer } from "@/server/customers/session";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { sellerAccessToken } from "@/server/payments/accounts";
import { startMercadoPagoCheckout } from "@/server/payments/checkout";
import { getMercadoPago } from "@/server/payments/session";

/** Same access rule as the page: the private link, or the signed-in customer who placed it. */
async function findOrder(id: string, token: string) {
  const repo = getOrderRepository();
  await repo.releaseExpired();
  const byToken = await repo.getOrderByToken(id, token);
  if (byToken) return byToken;
  const customer = await getCurrentCustomer().catch(() => null);
  const candidate = customer ? await repo.getOrder(id).catch(() => null) : null;
  return candidate && customer && candidate.customerId === customer.id ? candidate : null;
}

/** "Pagar con Mercado Pago": creates the Mercado Pago order and sends the customer to its checkout. */
export async function payWithMercadoPagoAction(form: FormData): Promise<void> {
  if (!ordersAvailable()) notFound();
  const id = String(form.get("orderId") ?? "");
  const token = String(form.get("t") ?? "");
  const order = await findOrder(id, token);
  if (!order) notFound();

  const back = `/pedido/${order.id}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const withResult = (reason: string) => `${back}${token ? "&" : "?"}pago=${reason}`;
  const mercadoPago = getMercadoPago();
  if (!mercadoPago) redirect(withResult("not_connected"));

  const result = await startMercadoPagoCheckout(
    {
      accessToken: () => sellerAccessToken(mercadoPago.accounts, mercadoPago.client, mercadoPago.config.serverAccessToken),
      client: mercadoPago.client,
    },
    order,
    { returnUrl: `${site.url}${back}` },
  );
  redirect(result.ok ? result.url : withResult(result.reason));
}
