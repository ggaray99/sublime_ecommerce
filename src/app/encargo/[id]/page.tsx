import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import { QuoteDecision } from "@/components/requests/quote-decision";
import { RequestHistory, RequestSummary } from "@/components/requests/request-view";
import { quoteIsOpen, requestNumber, type CustomRequestDetail } from "@/server/custom-requests/repository";
import { customRequestsAvailable, getCustomRequestRepository } from "@/server/custom-requests/session";
import { getCurrentCustomer } from "@/server/customers/session";

export const metadata: Metadata = {
  title: "Tu encargo",
  robots: { index: false, follow: false },
  // The URL carries the private token: never send it to other sites.
  referrer: "no-referrer",
};

type Props = PageProps<"/encargo/[id]">;

/** Visible with the private link (?t=token) or to the signed-in customer who made it; anyone else gets a 404. */
async function RequestPage({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  await connection();
  if (!customRequestsAvailable()) notFound();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.t === "string" ? query.t : "";
  const repo = getCustomRequestRepository();

  let request: CustomRequestDetail | null = await repo.getByToken(id, token);
  if (!request) {
    const customer = await getCurrentCustomer().catch(() => null);
    const candidate = customer ? await repo.get(id).catch(() => null) : null;
    request = candidate && customer && candidate.customerId === customer.id ? candidate : null;
  }
  if (!request) notFound();
  const access = token ? `?t=${encodeURIComponent(token)}` : "";

  return (
    <div className="account">
      <section className="account__section" aria-labelledby="encargo-title">
        <h2 id="encargo-title">{query.nuevo ? `¡Recibimos tu encargo ${requestNumber(request)}!` : `Encargo ${requestNumber(request)}`}</h2>
        {request.status === "received" && (
          <p className="panel panel--muted" role="status">
            Lo revisamos y te respondemos con un presupuesto a {request.contactEmail}. También lo vas a ver en esta página.
          </p>
        )}
        <RequestSummary request={request} fileHref={(fileId) => `/api/encargos/${request.id}/archivos/${fileId}${access}`} />
        {quoteIsOpen(request) && (
          <>
            <h3 className="account__subtitle">¿Seguimos?</h3>
            <QuoteDecision requestId={request.id} token={token} />
          </>
        )}
        {request.status === "quoted" && !quoteIsOpen(request) && (
          <p className="form-alert">El presupuesto venció. Escribinos y te mandamos uno actualizado.</p>
        )}
        <p className="muted">Guardá este enlace para volver a ver tu encargo. {request.customerId ? "También lo ves en Mi cuenta." : ""}</p>
        <div className="actions">
          <Link className="btn btn--ghost" href="/tienda">
            Ir a la tienda
          </Link>
        </div>
      </section>
      <section className="account__section" aria-labelledby="encargo-historial">
        <h2 id="encargo-historial">Historial</h2>
        <RequestHistory request={request} />
      </section>
    </div>
  );
}

export default function EncargoPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Encargo" title="TU ENCARGO." tone="light">
        <p>Entorno de prueba: el encargo está guardado en la base de staging.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el encargo…</p>}>
        <RequestPage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
