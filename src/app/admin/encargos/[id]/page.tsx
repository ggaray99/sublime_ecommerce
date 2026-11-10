import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { RequestActions, QuoteResponseForm } from "@/components/admin/request-forms";
import { AdminUnavailable, priceInput } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { RequestHistory, RequestSummary } from "@/components/requests/request-view";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { argentinaToday, requestNumber } from "@/server/custom-requests/repository";
import { getCustomRequestRepository } from "@/server/custom-requests/session";

export const metadata: Metadata = {
  title: "Encargo · Administración",
  robots: { index: false, follow: false },
};

const inDays = (days: number) => {
  const date = new Date(`${argentinaToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function RequestAdmin({ params }: { params: PageProps<"/admin/encargos/[id]">["params"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const { id } = await params;
  const request = await getCustomRequestRepository()
    .get(id)
    .catch(() => null);
  if (!request) notFound();
  const canQuote = request.status === "received" || request.status === "quoted";

  return (
    <div className="account">
      <AdminNav current="encargos" />
      <p>
        <Link href="/admin/encargos">← Volver a encargos</Link>
      </p>
      <section className="account__section" aria-labelledby="encargo-title">
        <h2 id="encargo-title">Encargo {requestNumber(request)}</h2>
        <p className="muted">
          {request.contactName} · <a href={`mailto:${request.contactEmail}`}>{request.contactEmail}</a> ·{" "}
          {request.customerId ? "cliente con cuenta" : "sin cuenta"}
          {request.productSlug && (
            <>
              {" · vino desde "}
              <Link href={`/producto/${request.productSlug}`}>{request.productSlug}</Link>
            </>
          )}
        </p>
        <RequestSummary request={request} production fileHref={(fileId) => `/api/encargos/${request.id}/archivos/${fileId}`} />
      </section>

      {canQuote && (
        <section className="account__section" aria-labelledby="presupuesto-title">
          <h2 id="presupuesto-title">{request.status === "quoted" ? "Actualizar presupuesto" : "Responder con un presupuesto"}</h2>
          <QuoteResponseForm
            requestId={request.id}
            resend={request.status === "quoted"}
            initial={{
              amount: request.quoteMinor ? priceInput(request.quoteMinor) : "",
              deposit: request.depositMinor ? priceInput(request.depositMinor) : "",
              message: request.quoteMessage,
              validUntil: request.quoteValidUntil ?? inDays(7),
              etaDays: request.quoteEtaDays ? String(request.quoteEtaDays) : "",
            }}
          />
        </section>
      )}

      <section className="account__section" aria-labelledby="acciones-title">
        <h2 id="acciones-title">Acciones</h2>
        <RequestActions requestId={request.id} status={request.status} />
      </section>

      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial</h2>
        <RequestHistory request={request} />
      </section>
    </div>
  );
}

export default function AdminRequestPage({ params }: PageProps<"/admin/encargos/[id]">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="ENCARGO." tone="light">
        <p>Detalle, presupuesto e historial del encargo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <RequestAdmin params={params} />
      </Suspense>
    </main>
  );
}
