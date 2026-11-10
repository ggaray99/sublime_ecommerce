import { site } from "../../data/site.ts";
import { getSql, hasDatabase } from "../db/client.ts";
import { createPaymentAccountRepository } from "./accounts.ts";
import { mercadoPagoConfig } from "./config.ts";
import { createMercadoPagoClient } from "./mercadopago.ts";

/** Mercado Pago wiring for this deployment, or null while online payments are off here. */
export function getMercadoPago() {
  const config = mercadoPagoConfig();
  if (!config || !hasDatabase()) return null;
  return {
    config,
    accounts: createPaymentAccountRepository(getSql(), config.encryptionKey),
    client: createMercadoPagoClient(config),
  };
}

/** Customers can pay with Mercado Pago here: configured and with an account (connected or the server's token). */
export async function onlinePaymentsAvailable(): Promise<boolean> {
  const mercadoPago = getMercadoPago();
  if (!mercadoPago) return false;
  if (mercadoPago.config.serverAccessToken) return true;
  return Boolean(await mercadoPago.accounts.get().catch(() => null));
}

/** Must match a redirect URL registered in the Mercado Pago application. */
export const mercadoPagoRedirectUri = () => `${site.url}/api/mercadopago/callback`;
/** Registered in the Mercado Pago application (Webhooks, event "Order (Mercado Pago)"). */
export const mercadoPagoWebhookUrl = () => `${site.url}/api/mercadopago/webhook`;

/** Short-lived cookie holding the OAuth state and PKCE verifier between connect and callback. */
export const OAUTH_COOKIE = "mp_oauth";
