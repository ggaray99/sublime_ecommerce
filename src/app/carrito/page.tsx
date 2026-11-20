import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { PageIntro } from "@/components/page-intro";
import { ordersAvailable } from "@/server/orders/session";
import { getStorefrontDesigns, getStorefrontProducts } from "@/server/storefront";
import { toCartDesign } from "@/lib/cart";
import { forClient } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Carrito de prueba de Sublime: agregá, quitá y modificá cantidades sin compras reales.",
  alternates: { canonical: "/carrito" },
};

export default async function CarritoPage() {
  const [products, designs] = await Promise.all([getStorefrontProducts(), getStorefrontDesigns()]);
  const catalog = products.map((product) => forClient(product));
  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Carrito de prueba"
        title={
          <>
            TU <em>SELECCIÓN.</em>
          </>
        }
      >
        <p>El carrito se guarda solo en este navegador y no contiene datos personales.</p>
      </PageIntro>
      <CartView catalog={catalog} designs={designs.map(toCartDesign)} realCheckout={ordersAvailable()} />
    </main>
  );
}
