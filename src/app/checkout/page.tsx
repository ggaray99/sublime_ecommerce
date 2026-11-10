import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckoutDemo } from "@/components/cart/checkout-demo";
import { CheckoutForm } from "@/components/cart/checkout-form";
import { PageIntro } from "@/components/page-intro";
import { getCurrentCustomer, getCustomerRepository } from "@/server/customers/session";
import { PROVINCES } from "@/server/customers/validation";
import { getShippingRepository, ordersAvailable } from "@/server/orders/session";
import { onlinePaymentsAvailable } from "@/server/payments/session";
import { getStorefrontProducts } from "@/server/storefront";
import { forClient } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirmá tu pedido en Sublime.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: true },
};

/** Request-time: reads the session to pre-fill contact data and saved addresses. */
async function RealCheckout() {
  await connection();
  const catalog = (await getStorefrontProducts()).map((product) => forClient(product));
  const customer = await getCurrentCustomer().catch(() => null);
  const shipping = getShippingRepository();
  const [addresses, shippingRules, pickup, onlinePayment] = await Promise.all([
    customer ? getCustomerRepository().listAddresses(customer.id) : Promise.resolve([]),
    shipping.listRules({ activeOnly: true }),
    shipping.getPickup(),
    onlinePaymentsAvailable(),
  ]);
  return (
    <CheckoutForm
      catalog={catalog}
      onlinePayment={onlinePayment}
      signedIn={Boolean(customer)}
      prefill={{ name: customer?.fullName ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "" }}
      // The default address comes first and is pre-selected.
      addresses={addresses}
      provinces={PROVINCES}
      shippingRules={shippingRules}
      pickup={pickup}
    />
  );
}

export default async function CheckoutPage() {
  if (!ordersAvailable()) {
    const catalog = (await getStorefrontProducts()).map((product) => forClient(product));
    return (
      <main id="contenido" className="page">
        <PageIntro
          kicker="Checkout simulado"
          title={
            <>
              CHECKOUT <em>DEMO.</em>
            </>
          }
        >
          <p>
            Así se organizaría la compra cuando la tienda esté habilitada. Hoy no hay pagos, envíos ni pedidos reales: ningún
            paso solicita ni procesa datos.
          </p>
        </PageIntro>
        <CheckoutDemo catalog={catalog} />
      </main>
    );
  }

  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Checkout"
        title={
          <>
            CONFIRMÁ TU <em>PEDIDO.</em>
          </>
        }
      >
        <p>Completá tus datos y elegí la entrega y cómo pagar.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el checkout…</p>}>
        <RealCheckout />
      </Suspense>
    </main>
  );
}
