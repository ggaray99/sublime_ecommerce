import Link from "next/link";

export default function NotFound() {
  return (
    <main id="contenido" className="page not-found">
      <p className="kicker">Error 404</p>
      <h1>
        ESTO NO
        <br />
        <em>SE PEGÓ.</em>
      </h1>
      <p>La página que buscás no existe o cambió de lugar.</p>
      <div className="actions">
        <Link className="btn btn--acid btn--lg" href="/tienda">
          Ir a la tienda
        </Link>
        <Link className="btn btn--ghost-light btn--lg" href="/">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
