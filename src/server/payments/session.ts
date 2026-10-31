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

/** Must match a redirect URL registered in the Mercado Pago application. */
export const mercadoPagoRedirectUri = () => `${site.url}/api/mercadopago/callback`;
export const mercadoPagoWebhookUrl = () => `${site.url}/api/mercadopago/webhook`;

/** Short-lived cookie holding the OAuth state and PKCE verifier between connect and callback. */
export const OAUTH_COOKIE = "mp_oauth";
