import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CustomerFilters } from "@/components/admin/customers/list-filters";
import { CustomerListSkeleton } from "@/components/admin/customers/list-skeleton";
import { CustomerListTable, TOTAL_NOTE_ID } from "@/components/admin/customers/list-table";
import customerStyles from "@/components/admin/customers/list.module.css";
import styles from "@/components/admin/products/list.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Button, Card, EmptyState, PageHeader, Pagination, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { customerSearchToQuery, hasActiveCustomerFilters, parseCustomerSearch } from "@/server/customers/customer-search";
import { getCustomerAdminRepository } from "@/server/customers/session";

export const metadata: Metadata = {
  title: "Clientes · Administración",
  robots: { index: false, follow: false },
};

const LIST = "/admin/clientes";

async function CustomerList({ searchParams }: { searchParams: PageProps<"/admin/clientes">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const search = parseCustomerSearch(await searchParams);
  const result = await getCustomerAdminRepository().search(search);
  const filtered = hasActiveCustomerFilters(search);
  // The current query, normalized: pagination links keep every filter.
  const query = customerSearchToQuery(search);

  return (
    <Stack gap={4}>
      <PageHeader
        title="Clientes"
        subtitle="Las personas que crearon una cuenta en la tienda. Las compras como invitado (sin cuenta) están en Pedidos."
      />

      <Card padding="none">
        <div className={styles.list}>
          <CustomerFilters search={search} />

          {result.items.length > 0 ? (
            <>
              <CustomerListTable customers={result.items} />
              <p id={TOTAL_NOTE_ID} className={customerStyles.note}>
                Total pagado: pedidos pagados, enviados y entregados.
              </p>
            </>
          ) : filtered ? (
            <EmptyState
              heading="No hay clientes con estos filtros"
              action={
                <Button href={LIST} variant="primary">
                  Limpiar filtros
                </Button>
              }
            >
              <p>Probá con otra búsqueda, otras fechas o quitá algún filtro.</p>
            </EmptyState>
          ) : (
            <EmptyState heading="Todavía no hay clientes con cuenta">
              <p>Cuando alguien cree una cuenta en la tienda, aparece acá.</p>
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
                {result.total} {result.total === 1 ? "cliente" : "clientes"}
              </p>
            )
          )}
        </div>
      </Card>
    </Stack>
  );
}

export default function AdminCustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<CustomerListSkeleton />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
