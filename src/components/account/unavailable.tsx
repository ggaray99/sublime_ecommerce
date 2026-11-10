import Link from "next/link";

/** Shown where customer accounts are disabled (production today). */
export function AccountsUnavailable() {
  return (
    <div className="empty-state">
      <h2>Cuentas no disponibles todavía.</h2>
      <p>
        Las cuentas de cliente están en preparación y todavía no se habilitaron en este sitio. Podés seguir usando la
        tienda y el carrito como invitado.
      </p>
      <div className="actions">
        <Link className="btn btn--acid" href="/tienda">
          Ir a la tienda
        </Link>
      </div>
    </div>
  );
}
