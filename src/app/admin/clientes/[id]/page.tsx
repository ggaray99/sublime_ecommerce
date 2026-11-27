import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  CustomerActivityCard,
  CustomerAddressesCard,
  CustomerContactCard,
  CustomerGuestMatchesCard,
  CustomerMetricsCard,
  CustomerOrdersCard,
  CustomerRequestsCard,
} from "@/components/admin/customers/profile-cards";
import { argentinaDate } from "@/components/admin/customers/profile-helpers";
import styles from "@/components/admin/orders/detail.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Badge, Breadcrumbs, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getCustomRequestRepository } from "@/server/custom-requests/session";
import { customerActivity, guestMatches, reviewOrderCount } from "@/server/customers/profile";
import { getCustomerAdminRepository, getCustomerRepository } from "@/server/customers/session";
import { getSql } from "@/server/db/client";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Cliente · Administración",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/clientes/[id]">;

const LIST_LIMIT = 50;
const ACTIVITY_LIMIT = 15;
const GUEST_LIMIT = 20;

async function CustomerProfile({ params }: Pick<Props, "params">) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const { id } = await params;
  const customer = await getCustomerAdminRepository().get(id);
  if (!customer) notFound();
  // One URL per customer: links that carry customers.id (orders, encargos) land on the account id.
  if (customer.authUserId !== id) redirect(`/admin/clientes/${encodeURIComponent(customer.authUserId)}`);

  const sql = getSql();
  const customerId = customer.customerId;
  const [addresses, orders, requests, activity, reviewCount, guests] = await Promise.all([
    customerId ? getCustomerRepository().listAddresses(customerId) : [],
    customerId ? getOrderRepository().listOrders({ customerId, limit: LIST_LIMIT }) : [],
    customerId ? getCustomRequestRepository().list({ customerId, limit: LIST_LIMIT }) : [],
    customerId ? customerActivity(sql, customerId, ACTIVITY_LIMIT) : [],
    customerId ? reviewOrderCount(sql, customerId) : 0,
    guestMatches(sql, customer.email, GUEST_LIMIT),
  ]);
  const name = customer.name || customer.email;

  return (
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Clientes", href: "/admin/clientes" }, { label: name }]} />}
        back={{ href: "/admin/clientes", label: "Volver a Clientes" }}
        title={name}
        meta={
          <>
            {customer.isAdmin && <Badge tone="attention">Admin</Badge>}
            {!customerId && <Badge tone="info">Sin Mi cuenta</Badge>}
            <span className={styles.headerDate}>
              Alta <time dateTime={customer.createdAt.toISOString()}>{argentinaDate(customer.createdAt)}</time>
            </span>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <CustomerMetricsCard customer={customer} reviewCount={reviewCount} />
          <CustomerOrdersCard orders={orders} total={customer.orderCount} email={customer.email} />
          <CustomerRequestsCard requests={requests} accountEmail={customer.email} total={customer.requestCount} />
          <CustomerActivityCard events={activity} />
          <CustomerGuestMatchesCard orders={guests.orders} requests={guests.requests} />
        </div>

        <div className={styles.side}>
          <CustomerContactCard customer={customer} />
          <CustomerAddressesCard addresses={addresses} />
        </div>
      </div>
    </Stack>
  );
}

function ProfileSkeleton() {
  return (
    <Skeleton label="Cargando el cliente…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
        <div className={styles.layout}>
          <div className={styles.main}>
            <SkeletonBlock height={140} />
            <SkeletonBlock height={260} />
            <SkeletonBlock height={180} />
          </div>
          <div className={styles.side}>
            <SkeletonBlock height={240} />
            <SkeletonBlock height={160} />
          </div>
        </div>
      </Stack>
    </Skeleton>
  );
}

export default function AdminCustomerPage({ params }: Props) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<ProfileSkeleton />}>
        <CustomerProfile params={params} />
      </Suspense>
    </main>
  );
}
