import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable, AuditList } from "@/components/admin/shared";
import { legacyProductsHref } from "@/components/admin/shell/nav-items";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { loadDashboard, type AttentionGroup } from "@/server/admin/dashboard";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Inicio · Administración",
  robots: { index: false, follow: false },
};

/** One "Para atender" card: the items with something to do, or an empty state. */
function AttentionCard({ group }: { group: AttentionGroup }) {
  return (
    <Card
      title={group.title}
      headingLevel={3}
      actions={
        <Button href={group.listHref} variant="tertiary" size="sm">
          {group.listLabel}
        </Button>
      }
    >
      {group.items.length ? (
        <ul className={styles.items}>
          {group.items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.item}>
                <span className={styles.itemText}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemDescription}>{item.description}</span>
                </span>
                <Badge tone={item.tone}>{item.count}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState heading={group.emptyMessage} headingLevel={4} />
      )}
    </Card>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  // The products list used to live here: old filtered links keep working.
  const legacy = legacyProductsHref(await searchParams);
  if (legacy) redirect(legacy);

  const { attention, recent } = await loadDashboard(getSql());

  return (
    <Stack gap={6}>
      <PageHeader title="Inicio" subtitle="Resumen de lo que necesita tu atención hoy." />

      <section className={styles.section} aria-labelledby="para-atender-title">
        <h2 id="para-atender-title" className={styles.sectionTitle}>
          Para atender
        </h2>
        <div className={styles.attention}>
          {attention.map((group) => (
            <AttentionCard key={group.id} group={group} />
          ))}
        </div>
      </section>

      <div className={styles.columns}>
        <Card section id="ventas" title="Ventas">
          {/* No sales reporting exists yet: say so instead of showing numbers. */}
          <EmptyState variant="unavailable" heading="Ventas, ingresos y conversión" headingLevel={3}>
            <p>El panel todavía no calcula estas métricas. Cuando existan esos datos, se van a mostrar acá.</p>
          </EmptyState>
        </Card>
        <Card
          section
          id="actividad-reciente"
          title="Actividad reciente"
          actions={
            <Button href="/admin/actividad" variant="tertiary" size="sm">
              Ver toda la actividad
            </Button>
          }
        >
          {recent.length ? <AuditList entries={recent} /> : <EmptyState heading="Todavía no hay cambios registrados" headingLevel={3} />}
        </Card>
      </div>
    </Stack>
  );
}

/** Shown while the session and the counts load; says nothing about the panel. */
function DashboardSkeleton() {
  return (
    <Skeleton>
      <Stack gap={6}>
        <SkeletonText lines={2} />
        <div className={styles.attention}>
          <SkeletonBlock height={160} />
          <SkeletonBlock height={160} />
          <SkeletonBlock height={160} />
        </div>
        <div className={styles.columns}>
          <SkeletonBlock height={220} />
          <SkeletonBlock height={220} />
        </div>
      </Stack>
    </Skeleton>
  );
}

export default function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
