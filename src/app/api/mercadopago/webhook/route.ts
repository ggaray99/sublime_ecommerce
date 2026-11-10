import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/server/db/client";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { sellerAccessToken } from "@/server/payments/accounts";
import { MercadoPagoError } from "@/server/payments/mercadopago";
import { getMercadoPago } from "@/server/payments/session";
import { createPaymentRepository, reconcilePayment, verifyWebhookSignature } from "@/server/payments/webhook";
import { CATALOG_TAG } from "@/server/storefront";

/** Every notice leaves one log line (type, Mercado Pago id, outcome): never headers, body or tokens. */
function answer(request: NextRequest, outcome: string, status = 200) {
  const params = request.nextUrl.searchParams;
  const id = (params.get("data.id") ?? "-").replace(/[^A-Za-z0-9]/g, "").slice(0, 64) || "-";
  const type = (params.get("type") ?? params.get("topic") ?? "-").replace(/[^a-z_.]/g, "").slice(0, 40) || "-";
  console.info(`[mercadopago] webhook type=${type} id=${id} → ${status} ${outcome}`);
  return NextResponse.json({ outcome }, { status });
}

/**
 * Mercado Pago notifications (application webhook, event "Order (Mercado Pago)":
 * ?data.id=ORD…&type=order). Only signed requests are processed, and the order
 * is always read back from Mercado Pago with the seller's token.
 * 200 = handled or nothing to do (stops retries); 5xx = try again later.
 */
export async function POST(request: NextRequest) {
  const mercadoPago = getMercadoPago();
  if (!mercadoPago || !ordersAvailable()) return answer(request, "disabled", 404);

  const params = request.nextUrl.searchParams;
  const signedId = params.get("data.id");
  const valid = verifyWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: signedId,
    secret: mercadoPago.config.webhookSecret,
  });
  if (!valid) return answer(request, "invalid_signature", 401);

  const body = (await request.json().catch(() => ({}))) as { type?: string };
  const type = params.get("type") ?? body.type;
  if (type !== "order" || !signedId || !/^[A-Za-z0-9]{1,64}$/.test(signedId)) return answer(request, "ignored");

  try {
    const token = await sellerAccessToken(mercadoPago.accounts, mercadoPago.client, mercadoPago.config.serverAccessToken);
    if (!token) return answer(request, "not_connected");
    const outcome = await reconcilePayment(
      { getOrder: (id) => mercadoPago.client.getOrder(token, id), orders: getOrderRepository(), payments: createPaymentRepository(getSql()) },
      signedId,
    );
    // A confirmed sale changes stock shown in the store.
    if (outcome === "paid" || outcome === "needs_review") revalidateTag(CATALOG_TAG, { expire: 0 });
    return answer(request, outcome);
  } catch (error) {
    // An order of another account (or deleted) will never resolve: stop the retries.
    if (error instanceof MercadoPagoError && error.status === 404) return answer(request, "ignored");
    console.error("[mercadopago] webhook failed", error instanceof Error ? error.message : "unknown error");
    return answer(request, "retry", 503);
  }
}
