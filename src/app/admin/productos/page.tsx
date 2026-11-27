import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BulkProductActions } from "@/components/admin/products/bulk-product-actions";
import { ProductFilters, ProductStatusTabs } from "@/components/admin/products/list-filters";
import { ProductListSkeleton } from "@/components/admin/products/list-skeleton";
import { ProductListTable } from "@/components/admin/products/list-table";
import styles from "@/components/admin/products/list.module.css";
import { SelectableTable } from "@/components/admin/selectable-table";
import { ExportSelectedButton, SelectionBar } from "@/components/admin/selection-bar";
import { AdminUnavailable } from "@/components/admin/shared";
import { Button, Card, EmptyState, PageHeader, Pagination, Stack } from "@/components/admin/ui";
import { hasActiveFilters, parseProductSearch, productSearchToQuery } from "@/server/admin/product-search";
import { adminAvailable, getAdminRepository, getCategoryRepository, getCurrentAdmin } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Productos · Administración",
  robots: { index: false, follow: false },
};

const LIST = "/admin/productos";

async function ProductList({ searchParams }: { searchParams: PageProps<"/admin/productos">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = parseProductSearch(await searchParams);
  const repo = getAdminRepository();
  const [result, facets, categoryList] = await Promise.all([
    repo.searchProducts(search),
    repo.productFacets(),
    getCategoryRepository().listCategories(),
  ]);
  const categories = categoryList.map((category) => ({
    value: category.id,
    label: category.active ? category.label : `${category.label} (oculta)`,
  }));
  const categoryLabels = Object.fromEntries(categories.map((category) => [category.value, category.label]));
  const filtered = hasActiveFilters(search);
  // The current query, normalized: pagination links keep every filter.
  const query = productSearchToQuery(search);

  return (
    <Stack gap={4}>
      <PageHeader
        title="Productos"
        secondaryActions={
          <>
            <Button href={`${LIST}/importar`}>Importar planilla</Button>
            {/* A file download: the link must not be prefetched or handled as navigation. */}
            <Button href={`${LIST}/exportar`} download prefetch={false}>
              Exportar planilla
            </Button>
          </>
        }
        primaryAction={
          <Button variant="primary" href={`${LIST}/nuevo`}>
            Nuevo producto
          </Button>
        }
      />

      <Card padding="none">
        <div className={styles.list}>
          <ProductStatusTabs search={search} facets={facets} />
          <ProductFilters search={search} facets={facets} categories={categories} />

          {result.items.length > 0 ? (
            // A new page, filter or order starts with nothing selected (key).
            <SelectableTable key={query} ids={result.items.map((product) => product.id)}>
              <div className={styles.selection}>
                <SelectionBar hint={result.pages > 1 ? "La selección vale para los productos de esta página." : undefined}>
                  <BulkProductActions />
                  <ExportSelectedButton endpoint={`${LIST}/exportar`} />
                </SelectionBar>
              </div>
              <ProductListTable products={result.items} categoryLabels={categoryLabels} />
            </SelectableTable>
          ) : filtered ? (
            <EmptyState
              heading="No hay productos con estos filtros"
              action={
                <Button href={LIST} variant="primary">
                  Limpiar filtros
                </Button>
              }
            >
              <p>Probá con otra búsqueda o quitá algún filtro.</p>
            </EmptyState>
          ) : (
            <EmptyState
              heading="Todavía no hay productos"
              action={
                <Button href={`${LIST}/nuevo`} variant="primary">
                  Nuevo producto
                </Button>
              }
            >
              <p>Creá el primero o importá una planilla.</p>
            </EmptyState>
          )}

          {result.pages > 1 ? (
            <div className={styles.footer}>
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                baseHref={LIST}
                searchParams={Object.fromEntries(new URLSearchParams(query.slice(1)))}
              />
            </div>
          ) : (
            result.total > 0 && (
              <p className={styles.summary} role="status">
                {result.total} {result.total === 1 ? "producto" : "productos"}
              </p>
            )
          )}
        </div>
      </Card>
    </Stack>
  );
}

export default function ProductsPage({ searchParams }: PageProps<"/admin/productos">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<ProductListSkeleton />}>
        <ProductList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
