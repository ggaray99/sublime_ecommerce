import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getApiKeyRepository, getCurrentAdmin } from "@/server/admin/session";
import { API_SCOPES, RATE_LIMIT, SCOPE_LABELS } from "@/server/api/keys";
import { missingPaymentSettings } from "@/server/payments/config";
import { getMercadoPago, mercadoPagoRedirectUri, mercadoPagoWebhookUrl } from "@/server/payments/session";
import { disconnectMercadoPagoAction, revokeApiKeyAction } from "./actions";

export const metadata: Metadata = {
  title: "Integraciones · Administración",
  robots: { index: false, follow: false },
};

const date = (value: Date | null) => (value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : "nunca");

/** Result of the connect flow (?mp=… set by /api/mercadopago/callback). */
const MP_RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Mercado Pago quedó conectado. Los clientes ya pueden pagar sus pedidos online." },
  denied: { ok: false, text: "La conexión no se autorizó en Mercado Pago. Podés intentarlo de nuevo cuando quieras." },
  expired: { ok: false, text: "La conexión venció o se abrió en otra pestaña. Tocá “Conectar Mercado Pago” de nuevo." },
  error: { ok: false, text: "Mercado Pago no respondió como esperábamos. Probá de nuevo en unos minutos." },
  config: { ok: false, text: "El servidor todavía no está configurado para cobrar online (ver abajo)." },
};

async function MercadoPagoSection({ result }: { result: string | undefined }) {
  const mercadoPago = getMercadoPago();
  const account = mercadoPago ? await mercadoPago.accounts.get() : null;
  const message = result ? MP_RESULTS[result] : undefined;

  return (
    <section className="account__section" aria-labelledby="mp-title">
      <h2 id="mp-title">Mercado Pago</h2>
      <p>Cobrá los pedidos online. Los clientes pagan en Mercado Pago y el pedido se marca como pagado solo.</p>
      {message &&
        (message.ok ? (
          <p className="panel panel--muted" role="status">
            {message.text}
          </p>
        ) : (
          <p className="form-alert" role="alert">
            {message.text}
          </p>
        ))}

      {!mercadoPago && (
        <div className="panel panel--muted">
          <p>Para conectar Mercado Pago, quien administra el servidor tiene que completar o corregir esta configuración:</p>
          <ul>
            {missingPaymentSettings().map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!account && (
        <div className="panel panel--muted">
          <p>Datos para la aplicación de Mercado Pago (Tus integraciones):</p>
          <ul>
            <li>
              URL de redireccionamiento: <code>{mercadoPagoRedirectUri()}</code>
            </li>
            <li>
              Webhook, evento “Order (Mercado Pago)”: <code>{mercadoPagoWebhookUrl()}</code>
            </li>
          </ul>
        </div>
      )}

      {!mercadoPago ? null : account ? (
        <div className="address-card">
          <p className="address-card__title">
            {account.nickname || `Cuenta ${account.userId}`}
            <span className="badge badge--acid">Conectada</span>
            {!account.liveMode && <span className="badge badge--pending">Modo prueba</span>}
          </p>
          {account.email && <p>{account.email}</p>}
          <p className="muted">
            Conectada por {account.connectedBy} el {date(account.connectedAt)}. La autorización se renueva sola.
          </p>
          <form action={disconnectMercadoPagoAction}>
            <ConfirmButton message="¿Desconectar Mercado Pago? Los clientes no van a poder pagar online hasta que la conectes de nuevo.">
              Desconectar
            </ConfirmButton>
          </form>
        </div>
      ) : (
        <>
          <p className="muted">Vas a iniciar sesión en Mercado Pago con la cuenta que va a recibir el dinero y autorizar a Sublime.</p>
          <a className="btn btn--violet" href="/api/mercadopago/connect">
            Conectar Mercado Pago
          </a>
        </>
      )}
    </section>
  );
}

async function Integrations({ searchParams }: { searchParams: PageProps<"/admin/integraciones">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  // Owner-only: editors and strangers get the same 404.
  if (!admin || admin.role !== "owner") notFound();
  const [keys, { mp }] = await Promise.all([getApiKeyRepository().listKeys(), searchParams]);

  return (
    <div className="account">
      <AdminNav current="integraciones" />

      <MercadoPagoSection result={typeof mp === "string" ? mp : undefined} />

      <section className="account__section" aria-labelledby="api-title">
        <h2 id="api-title">API de administración</h2>
        <p>
          Estándar de Sublime para automatizar cargas (n8n, scripts, sistemas externos): alta y modificación masiva de
          productos, precios y stock. Quien integre se adapta a este contrato.
        </p>
        <ul className="muted">
          <li>
            Base: <code>/api/admin/v1</code> · Contrato OpenAPI: <a href="/api/admin/v1/openapi.json">/api/admin/v1/openapi.json</a>
          </li>
          <li>
            Autenticación: encabezado <code>Authorization: Bearer &lt;clave&gt;</code>. Límite: {RATE_LIMIT} pedidos por minuto por clave.
          </li>
          <li>Todo cambio queda en el historial como “integration:&lt;nombre&gt;”.</li>
        </ul>
      </section>

      <section className="account__section" aria-labelledby="claves-title">
        <h2 id="claves-title">Claves</h2>
        {keys.length ? (
          <ul className="address-list">
            {keys.map((key) => (
              <li key={key.id} className="address-card">
                <p className="address-card__title">
                  {key.name}
                  {key.revokedAt ? <span className="badge badge--pending">Revocada</span> : <span className="badge badge--acid">Activa</span>}
                </p>
                <p className="muted">
                  <code>sk_sublime_{key.prefix}_…</code>
                </p>
                <p>{key.scopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}</p>
                <p className="muted">
                  Creada {date(key.createdAt)} · último uso {date(key.lastUsedAt)}
                  {key.revokedAt && ` · revocada ${date(key.revokedAt)}`}
                </p>
                {!key.revokedAt && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="keyId" value={key.id} />
                    <ConfirmButton message={`¿Revocar la clave "${key.name}"? Las automatizaciones que la usen dejan de funcionar.`}>
                      Revocar<span className="visually-hidden"> {key.name}</span>
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no hay claves.</p>
        )}
        <h3 className="account__subtitle">Nueva clave</h3>
        <ApiKeyForm scopes={API_SCOPES.map((scope) => ({ value: scope, label: SCOPE_LABELS[scope] }))} />
      </section>
    </div>
  );
}

export default function IntegrationsPage({ searchParams }: PageProps<"/admin/integraciones">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="INTEGRACIONES." tone="light">
        <p>Cobros con Mercado Pago y claves para conectar sistemas externos a la API de administración.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Integrations searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
