import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductForm, StockForm } from "@/components/admin/forms";
import { AdminUnavailable, AuditList, productStatusLabel, stockLabel } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCurrentAdmin } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Editar producto",
  robots: { index: false, follow: false },
};

const REASON_LABEL: Record<string, string> = {
  initial_count: "Conteo inicial",
  restock: "Ingreso",
  adjustment: "Ajuste",
  sale: "Venta",
};

/** Formats centavos for the price input ("2500" or "2500,50"). */
const priceInput = (minor: number | null) =>
  minor === null ? "" : minor % 100 ? `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, "0")}` : String(minor / 100);

async function ProductAdmin({ params }: { params: PageProps<"/admin/productos/[id]">["params"] }) {
  await connection();
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const repo = getAdminRepository();
  const product = await repo.getProduct(id).catch((error) => {
    if (error instanceof AdminDataError) notFound();
    throw error;
  });
  const [movements, audit] = await Promise.all([repo.listMovements(id), repo.listAudit({ entityId: id, limit: 20 })]);

  return (
    <div className="account">
      <p>
        <Link href="/admin">← Volver a productos</Link>
      </p>
      <section className="account__section" aria-labelledby="producto-title">
        <h2 id="producto-title">{product.name}</h2>
        <p className="muted">
          SKU {product.sku} · {productStatusLabel[product.status]} ·{" "}
          <Link href={`/producto/${product.slug}`}>Ver en la tienda</Link>
        </p>
        <ProductForm
          productId={product.id}
          price={priceInput(product.priceMinor)}
          status={product.status}
          requiresQuote={product.requiresQuote}
        />
      </section>

      <section className="account__section" aria-labelledby="stock-title">
        <h2 id="stock-title">Stock</h2>
        {product.trackStock ? (
          <>
            <p className="muted">
              Disponible: {stockLabel(product)} · En depósito: {product.onHand}
            </p>
            <StockForm productId={product.id} onHand={product.onHand} />
            <h3 className="account__subtitle">Movimientos</h3>
            {movements.length ? (
              <ol className="audit-list">
                {movements.map((movement) => (
                  <li key={movement.id}>
                    <p>
                      <strong>
                        {movement.deltaOnHand > 0 ? "+" : ""}
                        {movement.deltaOnHand}
                      </strong>{" "}
                      · {REASON_LABEL[movement.reason] ?? movement.reason}
                      {movement.note && ` · ${movement.note}`}
                    </p>
                    <p className="muted">
                      {movement.actor} · <time dateTime={movement.createdAt.toISOString()}>{movement.createdAt.toISOString().slice(0, 10)}</time>
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Sin movimientos registrados.</p>
            )}
          </>
        ) : (
          <p className="muted">Producto a pedido: se fabrica para cada encargo y no lleva stock.</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial de cambios</h2>
        <AuditList entries={audit} />
      </section>
    </div>
  );
}

export default function AdminProductPage({ params }: PageProps<"/admin/productos/[id]">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="EDITAR PRODUCTO." tone="light">
        <p>Entorno de prueba: los cambios se guardan en la base de staging y quedan registrados.</p>
      </PageIntro>
      {adminAvailable() ? (
        <Suspense fallback={<p className="panel panel--muted">Cargando el producto…</p>}>
          <ProductAdmin params={params} />
        </Suspense>
      ) : (
        <AdminUnavailable />
      )}
    </main>
  );
}
