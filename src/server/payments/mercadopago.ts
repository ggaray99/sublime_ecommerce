import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MercadoPagoConfig } from "./config.ts";

/**
 * Mercado Pago REST client (no SDK): OAuth account linking and Checkout Pro
 * through the Orders API. `fetch` is injectable for tests.
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

export type CheckoutOrderInput = {
  orderId: string;
  title: string;
  amountMinor: number;
  payerEmail: string;
  returnUrl: string;
  /** Whole minutes left in the stock reservation. */
  expiresInMinutes: number;
};

/** A Checkout Pro order (Orders API) as Mercado Pago reports it. */
export type MercadoPagoOrder = {
  id: string;
  /** created | processed (paid) | action_required | expired | canceled | failed | refunded… */
  status: string;
  statusDetail: string;
  externalReference: string;
  paidAmountMinor: number;
  currency: string;
};

/** "12000.50" ⇄ 1200050: the Orders API takes and returns amounts as decimal strings. */
const toAmount = (minor: number) => (minor / 100).toFixed(2);
// A non-numeric amount counts as nothing paid: never confirmed, and no endless webhook retries.
const toMinor = (amount: string | number | undefined) => {
  const value = Math.round(Number(amount ?? 0) * 100);
  return Number.isFinite(value) ? value : 0;
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

    /**
     * Checkout Pro via the Orders API: one line with the order total (discounts
     * and shipping already applied). Notifications come from the application's
     * webhook (event "Order (Mercado Pago)"), not from a per-order URL.
     */
    async createCheckoutOrder(accessToken: string, input: CheckoutOrderInput): Promise<{ id: string; checkoutUrl: string }> {
      const amount = toAmount(input.amountMinor);
      const order = await call<{ id: string; checkout_url: string }>("POST", "/v1/orders", {
        token: accessToken,
        // A new key per attempt (Mercado Pago's guidance): a retry after a failed checkout gets a fresh order.
        idempotencyKey: randomUUID(),
        body: {
          type: "online",
          processing_mode: "manual",
          external_reference: input.orderId,
          description: input.title,
          total_amount: amount,
          payer: { email: input.payerEmail },
          items: [{ title: input.title, quantity: 1, unit_price: amount, external_code: input.orderId }],
          expiration_time: `PT${input.expiresInMinutes}M`,
          config: {
            statement_descriptor: "SUBLIME",
            online: { success_url: input.returnUrl, failure_url: input.returnUrl, pending_url: input.returnUrl, auto_return: "approved" },
            // Cash (Rapipago, Pago Fácil) settles in days; the stock reservation lasts minutes.
            payment_method: { not_allowed_types: ["ticket", "atm"] },
          },
        },
      });
      if (!order.checkout_url) throw new MercadoPagoError(502, "missing_checkout_url");
      return { id: order.id, checkoutUrl: order.checkout_url };
    },

    async getOrder(accessToken: string, id: string): Promise<MercadoPagoOrder> {
      const order = await call<{
        id: string;
        status: string;
        status_detail?: string;
        external_reference?: string;
        total_paid_amount?: string;
        currency?: string;
      }>("GET", `/v1/orders/${encodeURIComponent(id)}`, { token: accessToken });
      return {
        id: order.id,
        status: order.status,
        statusDetail: order.status_detail ?? "",
        externalReference: order.external_reference ?? "",
        paidAmountMinor: toMinor(order.total_paid_amount),
        currency: order.currency ?? "",
      };
    },
  };
}

export type MercadoPagoClient = ReturnType<typeof createMercadoPagoClient>;
