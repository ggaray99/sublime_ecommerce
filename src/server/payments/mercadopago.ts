import { createHash, randomBytes } from "node:crypto";
import type { MercadoPagoConfig } from "./config.ts";

/**
 * Mercado Pago REST client (no SDK): OAuth account linking, Checkout Pro
 * preferences and payment lookups. `fetch` is injectable for tests.
 */

const API = "https://api.mercadopago.com";
const AUTH = "https://auth.mercadopago.com/authorization";
const TIMEOUT_MS = 15_000;

export class MercadoPagoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Mercado Pago respondió ${status} (${code}).`);
    this.status = status;
    this.code = code;
  }
}

export type LinkedTokens = {
  accessToken: string;
  refreshToken: string;
  publicKey: string;
  userId: string;
  liveMode: boolean;
  expiresAt: Date;
};

/** PKCE S256: the verifier stays on our side (cookie), only its hash goes to Mercado Pago. */
export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL(AUTH);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    platform_id: "mp",
    state: input.state,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

type TokenBody = { access_token?: string; refresh_token?: string; public_key?: string; user_id?: number | string; expires_in?: number; live_mode?: boolean };

function toTokens(body: TokenBody): LinkedTokens {
  if (!body.access_token || !body.refresh_token || body.user_id === undefined) throw new MercadoPagoError(502, "incomplete_token");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    publicKey: body.public_key ?? "",
    userId: String(body.user_id),
    liveMode: Boolean(body.live_mode),
    // Documented lifetime is 180 days; fall back to it if the field is missing.
    expiresAt: new Date(Date.now() + (body.expires_in ?? 15_552_000) * 1000),
  };
}

export type PreferenceInput = {
  orderId: string;
  title: string;
  amountMinor: number;
  payerEmail: string;
  returnUrl: string;
  notificationUrl: string;
  expiresAt: Date;
};

export type MercadoPagoPayment = {
  id: string;
  status: string;
  statusDetail: string;
  externalReference: string;
  amountMinor: number;
  currency: string;
  liveMode: boolean;
};

export function createMercadoPagoClient(config: MercadoPagoConfig, fetchFn: typeof fetch = fetch) {
  async function call<T>(method: "GET" | "POST", path: string, options: { body?: unknown; token?: string; idempotencyKey?: string } = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${API}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options.token && { Authorization: `Bearer ${options.token}` }),
          ...(options.idempotencyKey && { "X-Idempotency-Key": options.idempotencyKey }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new MercadoPagoError(503, "unreachable");
    }
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    // Only Mercado Pago's error code travels on: never the request (it may carry secrets).
    if (!response.ok) throw new MercadoPagoError(response.status, typeof data.error === "string" ? data.error : "error");
    return data;
  }

  const oauth = (body: Record<string, string>) =>
    call<TokenBody>("POST", "/oauth/token", { body: { client_id: config.clientId, client_secret: config.clientSecret, ...body } }).then(toTokens);

  return {
    exchangeCode: (code: string, redirectUri: string, codeVerifier: string) =>
      oauth({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        test_token: config.testMode ? "true" : "false",
      }),

    /** Mercado Pago rotates the refresh token too: save both. */
    refresh: (refreshToken: string) => oauth({ grant_type: "refresh_token", refresh_token: refreshToken }),

    async me(accessToken: string): Promise<{ nickname: string; email: string }> {
      const user = await call<{ nickname?: string; email?: string }>("GET", "/users/me", { token: accessToken });
      return { nickname: user.nickname ?? "", email: user.email ?? "" };
    },

    /** Checkout Pro: one line with the order total (discounts and shipping already applied). */
    async createPreference(accessToken: string, input: PreferenceInput): Promise<{ id: string; initPoint: string }> {
      const preference = await call<{ id: string; init_point: string }>("POST", "/checkout/preferences", {
        token: accessToken,
        idempotencyKey: `pref-${input.orderId}-${input.expiresAt.getTime()}`,
        body: {
          items: [{ id: input.orderId, title: input.title, quantity: 1, unit_price: input.amountMinor / 100, currency_id: "ARS" }],
          payer: { email: input.payerEmail },
          external_reference: input.orderId,
          notification_url: input.notificationUrl,
          back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
          auto_return: "approved",
          expires: true,
          expiration_date_to: input.expiresAt.toISOString(),
          statement_descriptor: "SUBLIME",
        },
      });
      return { id: preference.id, initPoint: preference.init_point };
    },

    async getPayment(accessToken: string, id: string): Promise<MercadoPagoPayment> {
      const payment = await call<{
        id: number;
        status: string;
        status_detail?: string;
        external_reference?: string;
        transaction_amount: number;
        currency_id: string;
        live_mode?: boolean;
      }>("GET", `/v1/payments/${encodeURIComponent(id)}`, { token: accessToken });
      return {
        id: String(payment.id),
        status: payment.status,
        statusDetail: payment.status_detail ?? "",
        externalReference: payment.external_reference ?? "",
        amountMinor: Math.round(payment.transaction_amount * 100),
        currency: payment.currency_id,
        liveMode: Boolean(payment.live_mode),
      };
    },
  };
}

export type MercadoPagoClient = ReturnType<typeof createMercadoPagoClient>;
