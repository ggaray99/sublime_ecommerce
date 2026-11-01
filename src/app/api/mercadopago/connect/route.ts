import { randomBytes } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { site } from "@/data/site";
import { getCurrentAdmin } from "@/server/admin/session";
import { authorizationUrl, pkcePair } from "@/server/payments/mercadopago";
import { getMercadoPago, mercadoPagoRedirectUri, OAUTH_COOKIE } from "@/server/payments/session";

/** "Conectar Mercado Pago": sends the owner to Mercado Pago to authorize the account that will collect. */
export async function GET(request: Request) {
  // Per request, never prerendered (the answer depends on the session).
  await connection();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "owner") return new NextResponse("Not found", { status: 404 });
  const back = new URL("/admin/integraciones", request.url);

  const mercadoPago = getMercadoPago();
  if (!mercadoPago) {
    back.searchParams.set("mp", "config");
    return NextResponse.redirect(back, 303);
  }

  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const response = NextResponse.redirect(
    authorizationUrl({ clientId: mercadoPago.config.clientId, redirectUri: mercadoPagoRedirectUri(), state, codeChallenge: challenge }),
    303,
  );
  // Lax: the callback is a top-level navigation back from Mercado Pago.
  response.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    // The public address, not request.url: behind the VPS proxy the app itself sees http.
    secure: site.url.startsWith("https://"),
    sameSite: "lax",
    path: "/api/mercadopago",
    maxAge: 600,
  });
  return response;
}
