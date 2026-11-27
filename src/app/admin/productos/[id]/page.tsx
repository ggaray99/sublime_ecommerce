import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductExtrasForm, ProductPricingCard, ProductShippingCard } from "@/components/admin/product-extras-form";
import { ProductDataCard, ProductDataForm, ProductOrganizationCard } from "@/components/admin/products/product-form";
import { ProductDuplicateButton } from "@/components/admin/products/product-duplicate-button";
import { ProductNotices, type ProductNotice } from "@/components/admin/products/product-notices";
import { STATUS_BADGE } from "@/components/admin/products/product-page-helpers";
import { ProductPublicationCard } from "@/components/admin/products/product-publication-card";
import { StockForm } from "@/components/admin/products/stock-form";
import styles from "@/components/admin/products/product-page.module.css";
import { AdminUnavailable, AuditList, loadCategoryOptions, priceInput, productFormValues, themeOptions } from "@/components/admin/shared";
import { Badge, Breadcrumbs, Button, Card, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { VariantsManager } from "@/components/admin/variants-manager";
import { toArgentinaInput } from "@/server/admin/product-extras";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getImageRepository, getProductExtrasRepository, getVariantRepository } from "@/server/admin/session";
import { optionsLabel } from "@/server/admin/variants";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Producto · Administración",
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
        .map((variant) => ({
          value: variant.sku,
          label: `${optionsLabel(variant.options, product.optionNames)} (${variant.sku})`,
          onHand: variant.onHand,
        }))
    : undefined;

  // One-time notices after creating, duplicating or a failed first photo (same texts as before).
  const notices: ProductNotice[] = [];
  if (query.creado) {
    notices.push({
      tone: "success",
      message: `Producto creado.${product.status === "draft" ? " Está en borrador: publicalo cuando esté completo." : ""}`,
    });
  }
  if (query.copia) {
    notices.push({
      tone: "success",
      message: "Copia creada en borrador, con las mismas variantes y precios. Cargá el stock y las fotos, y publicala cuando esté lista.",
    });
  }
  if (query.imagen === "error") {
    notices.push({
      tone: "critical",
      message: "El producto se creó, pero no pudimos guardar la foto. Probá subirla de nuevo en la sección Imágenes.",
    });
  }

  const badge = STATUS_BADGE[product.status];
  const available = product.onHand - product.reserved;

  return (
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Productos", href: "/admin/productos" }, { label: product.name }]} />}
        back={{ href: "/admin/productos", label: "Volver a Productos" }}
        title={product.name}
        subtitle={`SKU ${product.sku}`}
        meta={
          <>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {product.featured && <Badge tone="info">Destacado</Badge>}
          </>
        }
        secondaryActions={
          <>
            {product.status === "active" && <Button href={`/producto/${product.slug}`}>Ver en la tienda</Button>}
            <ProductDuplicateButton productId={product.id} />
          </>
        }
      />

      <ProductNotices notices={notices} />

      <ProductDataForm productId={product.id} status={product.status} initial={productFormValues(product)}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <ProductDataCard requiresQuote={product.requiresQuote} hasOptions={hasOptions} />

            <Card section id="imagenes" title="Imágenes">
              <ImageManager product={product} images={images} uploadsEnabled={hasMediaStorage()} />
            </Card>

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
            >
              <ProductPricingCard />

              <Card section id="variantes" title="Variantes">
                <VariantsManager product={product} variants={variants} />
              </Card>

              <Card section id="stock" title="Stock">
                {product.trackStock ? (
                  <>
                    <dl className={styles.stockFacts}>
                      <div>
                        <dt>En depósito</dt>
                        <dd>{product.onHand}</dd>
                      </div>
                      <div>
                        <dt>Reservado</dt>
                        <dd>{product.reserved}</dd>
                      </div>
                      <div>
                        <dt>Disponible</dt>
                        <dd>{available}</dd>
                      </div>
                    </dl>
                    <StockForm productId={product.id} onHand={product.onHand} variants={stockVariants} />
                    <div className={styles.block}>
                      <h3 className={styles.subtitle}>Movimientos</h3>
                      {movements.length ? (
                        <ol className={styles.movements}>
                          {movements.map((movement) => (
                            <li key={movement.id}>
                              <span>
                                <span className={styles.delta}>
                                  {movement.deltaOnHand > 0 ? "+" : ""}
                                  {movement.deltaOnHand}
                                </span>{" "}
                                · {REASON_LABEL[movement.reason] ?? movement.reason}
                                {hasOptions && ` · ${movement.sku}`}
                                {movement.note && ` · ${movement.note}`}
                              </span>
                              <span className={styles.imageMeta}>
                                {movement.actor} · <time dateTime={movement.createdAt.toISOString()}>{movement.createdAt.toISOString().slice(0, 10)}</time>
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className={styles.muted}>Sin movimientos registrados.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className={styles.muted}>Producto a pedido: se fabrica para cada encargo y no lleva stock.</p>
                )}
              </Card>

              <ProductShippingCard />
            </ProductExtrasForm>
          </div>

          <div className={styles.side}>
            <ProductPublicationCard productId={product.id} status={product.status} />
            <ProductOrganizationCard categories={categoryOptions} themes={themeOptions} />
            <Card section id="historial" title="Historial">
              <AuditList entries={audit} />
            </Card>
          </div>
        </div>
      </ProductDataForm>
    </Stack>
  );
}

function ProductSkeleton() {
  return (
    <Skeleton label="Cargando el producto…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
        <div className={styles.layout}>
          <div className={styles.main}>
            <SkeletonBlock height={320} />
            <SkeletonBlock height={200} />
          </div>
          <div className={styles.side}>
            <SkeletonBlock height={140} />
            <SkeletonBlock height={240} />
          </div>
        </div>
      </Stack>
    </Skeleton>
  );
}

export default function AdminProductPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductAdmin params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
