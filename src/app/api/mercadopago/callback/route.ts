import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { connection, NextResponse, type NextRequest } from "next/server";
import { getCurrentAdmin } from "@/server/admin/session";
import { COMMERCIAL_TAG } from "@/server/commercial";
import { getMercadoPago, mercadoPagoRedirectUri, OAUTH_COOKIE } from "@/server/payments/session";

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Mercado Pago sends the owner back here after authorizing. The code is
 * exchanged server-side (with the PKCE verifier) and the tokens are saved
 * encrypted; the browser only ever sees the result message.
 */
export async function GET(request: NextRequest) {
  await connection();
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "owner") return new NextResponse("Not found", { status: 404 });

  const back = new URL("/admin/integraciones", request.url);
  const done = (result: string) => {
    back.searchParams.set("mp", result);
    const response = NextResponse.redirect(back, 303);
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/mercadopago", maxAge: 0 });
    return response;
  };

  const mercadoPago = getMercadoPago();
  if (!mercadoPago) return done("config");

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!code) return done("denied");

  const [state, verifier] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  if (!state || !verifier || !sameText(state, params.get("state") ?? "")) return done("expired");

  try {
    const tokens = await mercadoPago.client.exchangeCode(code, mercadoPagoRedirectUri(), verifier);
    const profile = await mercadoPago.client.me(tokens.accessToken).catch(() => ({ nickname: "", email: "" }));
    await mercadoPago.accounts.connect(admin, tokens, profile);
  } catch (error) {
    console.error("[mercadopago] connect failed", error instanceof Error ? error.message : "unknown error");
    return done("error");
  }
  // Product pages list Mercado Pago among the payment methods once an account is connected.
  revalidateTag(COMMERCIAL_TAG, { expire: 0 });
  revalidatePath("/admin/integraciones");
  return done("connected");
}
