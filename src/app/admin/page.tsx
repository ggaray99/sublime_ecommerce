import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable, AuditList, productStatusLabel, stockLabel } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { adminAvailable, getAdminRepository, getCurrentAdmin } from "@/server/admin/session";
import { PRODUCT_STATUSES, type ProductStatus } from "@/server/admin/validation";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

/** Low stock threshold used to highlight rows that need a restock. */
const LOW_STOCK = 5;

async function AdminContent({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = PRODUCT_STATUSES.find((value) => value === params.estado) as ProductStatus | undefined;
  const repo = getAdminRepository();
  const [products, audit] = await Promise.all([repo.listProducts({ query, status }), repo.listAudit({ limit: 10 })]);

  return (
    <div className="account">
      <AdminNav current="productos" />
      <p className="muted">
        Sesión: {admin.email} · rol {admin.role === "owner" ? "dueño" : "editor"}
      </p>

      <section className="account__section" aria-labelledby="productos-title">
        <div className="account__head">
          <h2 id="productos-title">Productos</h2>
          <Link className="btn btn--acid" href="/admin/productos/nuevo">
            Nuevo producto
          </Link>
        </div>
        <form className="admin-filters" role="search" action="/admin">
          <div className="field">
            <label htmlFor="admin-q">Buscar</label>
            <input id="admin-q" name="q" type="search" defaultValue={query} placeholder="Nombre, SKU o código" />
          </div>
          <div className="field">
            <label htmlFor="admin-estado">Estado</label>
            <select id="admin-estado" name="estado" defaultValue={status ?? ""}>
              <option value="">Todos</option>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {productStatusLabel[value]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--coal">
            Filtrar
          </button>
        </form>

        <p className="muted" role="status">
          {products.length} {products.length === 1 ? "producto" : "productos"}
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Imagen</span>
                </th>
                <th scope="col">Producto</th>
                <th scope="col">SKU</th>
                <th scope="col">Estado</th>
                <th scope="col">Precio</th>
                <th scope="col">Stock disponible</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const available = product.onHand - product.reserved;
                return (
                  <tr key={product.id} className={product.trackStock && available <= LOW_STOCK ? "is-low" : undefined}>
                    <td className="admin-table__thumb">
                      <Image src={product.coverUrl} alt="" width={56} height={56} />
                    </td>
                    <th scope="row">
                      <Link href={`/admin/productos/${product.id}`}>{product.name}</Link>
                      {product.status === "active" && (
                        <>
                          {" · "}
                          <Link href={`/producto/${product.slug}`} className="admin-table__store">
                            Ver<span className="visually-hidden"> {product.name}</span> en la tienda
                          </Link>
                        </>
                      )}
                    </th>
                    <td>{product.sku}</td>
                    <td>{productStatusLabel[product.status]}</td>
                    <td>{product.priceMinor === null ? "A presupuestar" : formatPrice(product.priceMinor / 100)}</td>
                    <td>{stockLabel(product)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account__section" aria-labelledby="auditoria-title">
        <h2 id="auditoria-title">Últimos cambios</h2>
        <AuditList entries={audit} />
      </section>
    </div>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Interno" title="ADMINISTRACIÓN." tone="light">
        <p>Entorno de prueba: los cambios se guardan en la base de staging y quedan registrados.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el panel…</p>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
