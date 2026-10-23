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
import { revokeApiKeyAction } from "./actions";

export const metadata: Metadata = {
  title: "Integraciones · Administración",
  robots: { index: false, follow: false },
};

const date = (value: Date | null) => (value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : "nunca");

async function Integrations() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  // Owner-only: editors and strangers get the same 404.
  if (!admin || admin.role !== "owner") notFound();
  const keys = await getApiKeyRepository().listKeys();

  return (
    <div className="account">
      <AdminNav current="integraciones" />

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

export default function IntegrationsPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="INTEGRACIONES." tone="light">
        <p>Entorno de prueba: las claves funcionan contra la base de staging.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Integrations />
      </Suspense>
    </main>
  );
}
