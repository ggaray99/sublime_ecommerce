import { isProductionEnv } from "../env.ts";

export type MercadoPagoConfig = {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  /** 32 bytes for AES-256-GCM (PAYMENTS_ENCRYPTION_KEY, base64). */
  encryptionKey: Buffer;
  /** Sandbox credentials on connect (test_token), for Mercado Pago test users. */
  testMode: boolean;
};

const REQUIRED = ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET", "MERCADOPAGO_WEBHOOK_SECRET", "PAYMENTS_ENCRYPTION_KEY"] as const;

const encryptionKey = (value: string | undefined) => {
  const key = Buffer.from(value ?? "", "base64");
  return key.length === 32 ? key : null;
};

/**
 * Names of the settings that keep online payments off (never their values),
 * so the admin can say what is missing. Same rules as the other backend
 * features: a database, and in production an explicit switch.
 */
export function missingPaymentSettings(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  for (const name of REQUIRED) {
    if (name === "PAYMENTS_ENCRYPTION_KEY" ? !encryptionKey(env[name]) : !env[name]) missing.push(name);
  }
  if (isProductionEnv(env) && env.SUBLIME_PAYMENTS_IN_PRODUCTION !== "enabled") missing.push("SUBLIME_PAYMENTS_IN_PRODUCTION");
  return missing;
}

/** Mercado Pago settings, or null while online payments are off here. */
export function mercadoPagoConfig(env: NodeJS.ProcessEnv = process.env): MercadoPagoConfig | null {
  if (missingPaymentSettings(env).length) return null;
  return {
    clientId: env.MERCADOPAGO_CLIENT_ID as string,
    clientSecret: env.MERCADOPAGO_CLIENT_SECRET as string,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET as string,
    encryptionKey: encryptionKey(env.PAYMENTS_ENCRYPTION_KEY) as Buffer,
    testMode: env.MERCADOPAGO_TEST_MODE === "true",
  };
}
