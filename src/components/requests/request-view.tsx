import { argentinaTime } from "@/components/orders/order-view";
import { formatPrice } from "@/lib/format";
import { requestNumber, type CustomRequestDetail, type RequestStatus } from "@/server/custom-requests/repository";

export const requestStatusLabel: Record<RequestStatus, string> = {
  received: "Recibido",
  quoted: "Presupuestado",
  accepted: "Aceptado",
  declined: "Rechazado",
  in_production: "En producción",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const dateAr = (iso: string) => iso.split("-").reverse().join("/");

/** Request details shared by the customer page and the admin. `fileHref` builds the protected download link. */
export function RequestSummary({ request, fileHref }: { request: CustomRequestDetail; fileHref: (fileId: string) => string }) {
  return (
    <div className="order-summary">
      <dl className="order-facts">
        <div>
          <dt>Encargo</dt>
          <dd>{requestNumber(request)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className={`badge request-status request-status--${request.status}`}>{requestStatusLabel[request.status]}</span>
          </dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{argentinaTime(request.createdAt)}</dd>
        </div>
        <div>
          <dt>Producto</dt>
          <dd>
            {request.productType} · {request.quantity} unidades aprox.
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="account__subtitle">La idea</h3>
        <p className="request-idea">{request.idea}</p>
        {request.reference && <p className="muted">Referencia: {request.reference}</p>}
        {request.files.map((file) => (
          <p key={file.id}>
            Archivo:{" "}
            <a href={fileHref(file.id)} rel="nofollow">
              {file.originalName}
            </a>{" "}
            <span className="muted">({kb(file.sizeBytes)})</span>
          </p>
        ))}
      </div>
      {request.quoteMinor !== null && (
        <div className="request-quote">
          <h3 className="account__subtitle">Presupuesto</h3>
          <p className="request-quote__amount">{formatPrice(request.quoteMinor / 100)}</p>
          <ul className="muted">
            {request.depositMinor !== null && <li>Seña sugerida: {formatPrice(request.depositMinor / 100)} (se coordina al aceptar)</li>}
            {request.quoteEtaDays !== null && <li>Producción: {request.quoteEtaDays} días hábiles desde la aprobación</li>}
            {request.quoteValidUntil && <li>Válido hasta el {dateAr(request.quoteValidUntil)}</li>}
          </ul>
          {request.quoteMessage && <p className="request-idea">{request.quoteMessage}</p>}
        </div>
      )}
    </div>
  );
}

export function RequestHistory({ request }: { request: CustomRequestDetail }) {
  return (
    <ol className="audit-list">
      {request.events.map((event, index) => (
        <li key={index}>
          <p>
            <strong>{requestStatusLabel[event.toStatus as RequestStatus] ?? event.toStatus}</strong>
            {event.note && ` · ${event.note}`}
          </p>
          <p className="muted">
            {event.actor} · {argentinaTime(event.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
