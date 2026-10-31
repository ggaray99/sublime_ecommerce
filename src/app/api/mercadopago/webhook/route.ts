import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/server/db/client";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { sellerAccessToken } from "@/server/payments/accounts";
import { MercadoPagoError } from "@/server/payments/mercadopago";
import { getMercadoPago } from "@/server/payments/session";
import { createPaymentRepository, reconcilePayment, verifyWebhookSignature } from "@/server/payments/webhook";
import { CATALOG_TAG } from "@/server/storefront";

const answer = (outcome: string, status = 200) => NextResponse.json({ outcome }, { status });

/**
 * Mercado Pago notifications. Only signed requests are processed, and the
 * payment is always read back from Mercado Pago with the seller's token.
 * 200 = handled or nothing to do (stops retries); 5xx = try again later.
 */
export async function POST(request: NextRequest) {
  const mercadoPago = getMercadoPago();
  if (!mercadoPago || !ordersAvailable()) return answer("disabled", 404);

  const params = request.nextUrl.searchParams;
  const signedId = params.get("data.id");
  const valid = verifyWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: signedId,
    secret: mercadoPago.config.webhookSecret,
  });
  if (!valid) return answer("invalid_signature", 401);

  const body = (await request.json().catch(() => ({}))) as { type?: string };
  const type = params.get("type") ?? body.type;
  if (type !== "payment" || !signedId || !/^\d{1,20}$/.test(signedId)) return answer("ignored");

  try {
    const token = await sellerAccessToken(mercadoPago.accounts, mercadoPago.client);
    if (!token) return answer("not_connected");
    const outcome = await reconcilePayment(
      { getPayment: (id) => mercadoPago.client.getPayment(token, id), orders: getOrderRepository(), payments: createPaymentRepository(getSql()) },
      signedId,
    );
    // A confirmed sale changes stock shown in the store.
    if (outcome === "paid" || outcome === "needs_review") revalidateTag(CATALOG_TAG, { expire: 0 });
    return answer(outcome);
  } catch (error) {
    // A payment of another account (or deleted) will never resolve: stop the retries.
    if (error instanceof MercadoPagoError && error.status === 404) return answer("ignored");
    console.error("[mercadopago] webhook failed", error instanceof Error ? error.message : "unknown error");
    return answer("retry", 503);
  }
}
