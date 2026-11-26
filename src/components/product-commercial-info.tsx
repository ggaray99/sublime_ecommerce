import { commercialLines, paymentMethodLines, type CommercialInfo } from "@/lib/commercial";

type Props = {
  /** Unit price in pesos; null for products priced on request. */
  price: number | null;
  info: CommercialInfo;
};

/**
 * Transfer price, installments and free shipping under a price, plus the
 * payment methods on offer. No hooks: works in server and client components.
 */
export function ProductCommercialInfo({ price, info }: Props) {
  const lines = commercialLines(price, info);
  return (
    <div className="commercial-info">
      {lines.length > 0 && (
        <ul className="commercial-info__lines" aria-label="Precio con descuento, cuotas y envío">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <details className="commercial-info__methods">
        <summary>Medios de pago</summary>
        <ul>
          {paymentMethodLines(info).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
