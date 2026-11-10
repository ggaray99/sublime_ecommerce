import type { QueryFn } from "../db/client.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import type { LinkedTokens, MercadoPagoClient } from "./mercadopago.ts";

/** What the admin sees about the connected account: never the tokens. */
export type PaymentAccount = {
  userId: string;
  nickname: string;
  email: string;
  liveMode: boolean;
  expiresAt: Date;
  connectedBy: string;
  connectedAt: Date;
};

type Actor = { authUserId: string; email: string };
type Row = {
  external_user_id: string;
  nickname: string;
  email: string;
  live_mode: boolean;
  expires_at: Date;
  connected_by: string;
  connected_at: Date;
  access_token_enc: string;
  refresh_token_enc: string;
};

/** Refresh this long before the 180-day expiry, so a quiet store never ends up disconnected. */
const REFRESH_MARGIN_MS = 7 * 86_400_000;
const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

/** The single seller account (Mercado Pago) that receives the store's payments. */
export function createPaymentAccountRepository(sql: QueryFn, key: Buffer) {
  const load = async () => ((await sql.query("SELECT * FROM payment_accounts WHERE provider = 'mercadopago'")) as Row[])[0] ?? null;

  return {
    async get(): Promise<PaymentAccount | null> {
      const row = await load();
      if (!row) return null;
      return {
        userId: row.external_user_id,
        nickname: row.nickname,
        email: row.email,
        liveMode: row.live_mode,
        expiresAt: new Date(row.expires_at),
        connectedBy: row.connected_by,
        connectedAt: new Date(row.connected_at),
      };
    },

    async credentials(): Promise<{ accessToken: string; refreshToken: string; refreshTokenEnc: string; expiresAt: Date } | null> {
      const row = await load();
      if (!row) return null;
      return {
        accessToken: decryptSecret(row.access_token_enc, key),
        refreshToken: decryptSecret(row.refresh_token_enc, key),
        refreshTokenEnc: row.refresh_token_enc,
        expiresAt: new Date(row.expires_at),
      };
    },

    /** Connecting again (another account or a renewed authorization) replaces the previous one. */
    async connect(actor: Actor, tokens: LinkedTokens, profile: { nickname: string; email: string }): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO payment_accounts (provider, external_user_id, nickname, email, access_token_enc, refresh_token_enc, public_key, live_mode, expires_at, connected_by)
           VALUES ('mercadopago', $1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (provider) DO UPDATE SET
             external_user_id = EXCLUDED.external_user_id, nickname = EXCLUDED.nickname, email = EXCLUDED.email,
             access_token_enc = EXCLUDED.access_token_enc, refresh_token_enc = EXCLUDED.refresh_token_enc,
             public_key = EXCLUDED.public_key, live_mode = EXCLUDED.live_mode, expires_at = EXCLUDED.expires_at,
             connected_by = EXCLUDED.connected_by, connected_at = now(), updated_at = now()
           RETURNING provider
         )
         ${audit} SELECT $10, $9, 'integration.mercadopago_connect', 'integration', provider, $11::jsonb FROM saved`,
        [
          tokens.userId,
          profile.nickname.slice(0, 120),
          profile.email.slice(0, 200),
          encryptSecret(tokens.accessToken, key),
          encryptSecret(tokens.refreshToken, key),
          tokens.publicKey,
          tokens.liveMode,
          tokens.expiresAt,
          actor.email,
          actor.authUserId,
          JSON.stringify({ userId: tokens.userId, nickname: profile.nickname, liveMode: tokens.liveMode }),
        ],
      );
    },

    async disconnect(actor: Actor): Promise<void> {
      await sql.query(
        `WITH removed AS (DELETE FROM payment_accounts WHERE provider = 'mercadopago' RETURNING provider, external_user_id)
         ${audit} SELECT $1, $2, 'integration.mercadopago_disconnect', 'integration', provider, jsonb_build_object('userId', external_user_id) FROM removed`,
        [actor.authUserId, actor.email],
      );
    },

    /**
     * Saves a refreshed pair only if nobody refreshed in between (the old
     * refresh token is single-use once rotated). Returns false when it lost the race.
     */
    async rotate(previousRefreshEnc: string, tokens: LinkedTokens): Promise<boolean> {
      const rows = await sql.query(
        `UPDATE payment_accounts SET access_token_enc = $1, refresh_token_enc = $2, expires_at = $3, updated_at = now()
         WHERE provider = 'mercadopago' AND refresh_token_enc = $4 RETURNING provider`,
        [encryptSecret(tokens.accessToken, key), encryptSecret(tokens.refreshToken, key), tokens.expiresAt, previousRefreshEnc],
      );
      return rows.length === 1;
    },
  };
}

export type PaymentAccountRepository = ReturnType<typeof createPaymentAccountRepository>;

/**
 * The seller's access token, refreshed first when it is close to expiring.
 * Without an account connected by OAuth, the server's own token (direct mode,
 * MERCADOPAGO_ACCESS_TOKEN) is used when configured; otherwise null.
 */
export async function sellerAccessToken(accounts: PaymentAccountRepository, client: MercadoPagoClient, serverToken: string | null = null): Promise<string | null> {
  const current = await accounts.credentials();
  if (!current) return serverToken;
  if (current.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return current.accessToken;
  const tokens = await client.refresh(current.refreshToken);
  if (await accounts.rotate(current.refreshTokenEnc, tokens)) return tokens.accessToken;
  // Another request refreshed at the same time: use what it saved.
  return (await accounts.credentials())?.accessToken ?? null;
}
