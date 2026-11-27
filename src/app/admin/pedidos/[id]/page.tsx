import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderActions } from "@/components/admin/order-actions";
import {
  ArgentinaTime,
  OrderCustomerCard,
  OrderDeliveryCard,
  OrderHistoryCard,
  OrderPaymentCard,
  OrderProductsCard,
} from "@/components/admin/orders/detail-cards";
import styles from "@/components/admin/orders/detail.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Badge, Breadcrumbs, Card, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack, VisuallyHidden } from "@/components/admin/ui";
import { loadOrderMockups } from "@/components/orders/order-view";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { listOrderPayments } from "@/server/orders/payments-view";
import { OrderError, orderNumber } from "@/server/orders/repository";
import { getOrderRepository } from "@/server/orders/session";
import { DELIVERY_STATE, orderDeliveryState, orderPaymentState, PAYMENT_STATE } from "@/server/orders/status-view";

export const metadata: Metadata = {
  title: "Pedido · Administración",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/pedidos/[id]">;

async function OrderAdmin({ params }: Pick<Props, "params">) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const { id } = await params;
  const repo = getOrderRepository();
  await repo.releaseExpired();
  // Only a missing order is a 404; any other failure reaches the error boundary.
  const order = await repo.getOrder(id).catch((error: unknown) => {
    if (error instanceof OrderError && error.code === "not_found") notFound();
    throw error;
  });
  const [mockups, payments] = await Promise.all([loadOrderMockups(order, repo), listOrderPayments(getSql(), order.id)]);

  const code = orderNumber(order);
  const payment = PAYMENT_STATE[orderPaymentState(order.status)];
  const deliveryState = orderDeliveryState(order.status, order.delivery.method);
  const delivery = DELIVERY_STATE[deliveryState];

  return (
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Pedidos", href: "/admin/pedidos" }, { label: code }]} />}
        back={{ href: "/admin/pedidos", label: "Volver a Pedidos" }}
        title={`Pedido ${code}`}
        meta={
          <>
            <Badge tone={payment.tone}>
              <VisuallyHidden>Pago: </VisuallyHidden>
              {payment.label}
            </Badge>
            {deliveryState !== "none" && (
              <Badge tone={delivery.tone}>
                <VisuallyHidden>Entrega: </VisuallyHidden>
                {delivery.label}
              </Badge>
            )}
            <span className={styles.headerDate}>
              <ArgentinaTime date={order.createdAt} />
            </span>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <OrderProductsCard order={order} mockups={mockups} />
          <OrderDeliveryCard order={order} />
          <OrderHistoryCard order={order} />
        </div>

        <div className={styles.side}>
          <Card section id="acciones" title="Acciones">
            <OrderActions orderId={order.id} code={code} status={order.status} shipping={order.delivery.method === "shipping"} />
          </Card>
          <OrderPaymentCard order={order} payments={payments} />
          <OrderCustomerCard order={order} />
        </div>
      </div>
    </Stack>
  );
}

function OrderSkeleton() {
  return (
    <Skeleton label="Cargando el pedido…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
        <div className={styles.layout}>
          <div className={styles.main}>
            <SkeletonBlock height={280} />
            <SkeletonBlock height={160} />
            <SkeletonBlock height={200} />
          </div>
          <div className={styles.side}>
            <SkeletonBlock height={120} />
            <SkeletonBlock height={200} />
            <SkeletonBlock height={140} />
          </div>
        </div>
      </Stack>
    </Skeleton>
  );
}

export default function AdminOrderPage({ params }: Props) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<OrderSkeleton />}>
        <OrderAdmin params={params} />
      </Suspense>
    </main>
  );
}
