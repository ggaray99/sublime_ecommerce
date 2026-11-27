import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductForm, StockForm } from "@/components/admin/forms";
import { ImageManager } from "@/components/admin/image-manager";
import { VariantsManager } from "@/components/admin/variants-manager";
import {
  AdminUnavailable,
  AuditList,
  loadCategoryOptions,
  priceInput,
  productFormValues,
  productStatusLabel,
  stockLabel,
  themeOptions,
} from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getImageRepository, getProductExtrasRepository, getVariantRepository } from "@/server/admin/session";
import { optionsLabel } from "@/server/admin/variants";
import { hasMediaStorage } from "@/server/media/public-files";
import { ProductExtrasForm } from "@/components/admin/product-extras-form";
import { toArgentinaInput } from "@/server/admin/product-extras";
import { duplicateProductAction } from "@/app/admin/actions";

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

type Props = PageProps<"/admin/productos/[id]">;

async function ProductAdmin({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { id } = await params;
  const repo = getAdminRepository();
  const product = await repo.getProduct(id).catch((error) => {
    if (error instanceof AdminDataError) notFound();
    throw error;
  });
  const [movements, audit, query, categoryOptions, images, variants, extras] = await Promise.all([
    repo.listMovements(id),
    repo.listAudit({ entityId: id, limit: 20 }),
    searchParams,
    loadCategoryOptions(),
    getImageRepository().listImages(id),
    getVariantRepository().listVariants(id),
    getProductExtrasRepository().get(id),
  ]);
  const hasOptions = product.optionNames.length > 0;
  const stockVariants = hasOptions
    ? variants
        .filter((variant) => variant.active && variant.trackStock)
        .map((variant) => ({ value: variant.sku, label: `${optionsLabel(variant.options, product.optionNames)} (${variant.sku})` }))
    : undefined;

  return (
    <div className="account">
      <p>
        <Link href="/admin">← Volver a productos</Link>
      </p>
      <section className="account__section" aria-labelledby="producto-title">
        <div className="account__head">
          <h2 id="producto-title">{product.name}</h2>
          <form action={duplicateProductAction}>
            <input type="hidden" name="productId" value={product.id} />
            <button type="submit" className="btn btn--ghost">
              Duplicar
            </button>
          </form>
          {product.status === "active" ? (
            <Link className="btn btn--acid" href={`/producto/${product.slug}`}>
              Ver en la tienda
            </Link>
          ) : (
            <span className="badge badge--pending">No visible en la tienda ({productStatusLabel[product.status].toLowerCase()})</span>
          )}
        </div>
        <p className="muted">
          SKU {product.sku} · {productStatusLabel[product.status]}
        </p>
        {query.creado && (
          <p className="panel panel--muted" role="status">
            Producto creado. {product.status === "draft" && "Está en borrador: publicalo cuando esté completo."}
          </p>
        )}
        {query.copia && (
          <p className="panel panel--muted" role="status">
            Copia creada en borrador, con las mismas variantes y precios. Cargá el stock y las fotos, y publicala cuando esté lista.
          </p>
        )}
        {query.imagen === "error" && (
          <p className="form-alert" role="alert">
            El producto se creó, pero no pudimos guardar la foto. Probá subirla de nuevo en la sección Imágenes.
          </p>
        )}
        <ProductForm
          mode="edit"
          productId={product.id}
          requiresQuote={product.requiresQuote}
          initial={productFormValues(product)}
          categories={categoryOptions}
          themes={themeOptions}
          hasOptions={hasOptions}
        />
      </section>

      <section className="account__section" aria-labelledby="venta-title">
        <h2 id="venta-title">Venta y logística</h2>
        <ProductExtrasForm
          productId={product.id}
          priceMinor={product.priceMinor}
          hasOptions={hasOptions}
          initial={{
            weightG: extras?.weightG ? String(extras.weightG) : "",
            length: extras?.lengthMm ? String(extras.lengthMm / 10).replace(".", ",") : "",
            width: extras?.widthMm ? String(extras.widthMm / 10).replace(".", ",") : "",
            height: extras?.heightMm ? String(extras.heightMm / 10).replace(".", ",") : "",
            cost: extras?.costMinor !== null && extras?.costMinor !== undefined ? priceInput(extras.costMinor) : "",
            lowStockThreshold: extras?.lowStockThreshold !== null && extras?.lowStockThreshold !== undefined ? String(extras.lowStockThreshold) : "",
            saleKind: extras?.salePercent ? "percent" : extras?.salePriceMinor ? "price" : "none",
            salePercent: extras?.salePercent ? String(extras.salePercent) : "",
            salePrice: extras?.salePriceMinor ? priceInput(extras.salePriceMinor) : "",
            saleStartsAt: toArgentinaInput(extras?.saleStartsAt ?? null),
            saleEndsAt: toArgentinaInput(extras?.saleEndsAt ?? null),
          }}
        />
      </section>

      <section className="account__section" aria-labelledby="variantes-title">
        <h2 id="variantes-title">Variantes</h2>
        <VariantsManager product={product} variants={variants} />
      </section>

      <section className="account__section" aria-labelledby="imagenes-title">
        <h2 id="imagenes-title">Imágenes</h2>
        <ImageManager product={product} images={images} uploadsEnabled={hasMediaStorage()} />
      </section>

      <section className="account__section" aria-labelledby="stock-title">
        <h2 id="stock-title">Stock</h2>
        {product.trackStock ? (
          <>
            <p className="muted">
              Disponible: {stockLabel(product)} · En depósito: {product.onHand}
            </p>
            <StockForm productId={product.id} onHand={product.onHand} variants={stockVariants} />
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
                      {hasOptions && ` · ${movement.sku}`}
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

export default function AdminProductPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Editar producto" tone="light">
        <p>Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el producto…</p>}>
        <ProductAdmin params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
