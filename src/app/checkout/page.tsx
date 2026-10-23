import type { Metadata } from "next";
import { CheckoutDemo } from "@/components/cart/checkout-demo";
import { PageIntro } from "@/components/page-intro";
import { getStorefrontProducts } from "@/server/storefront";

export const metadata: Metadata = {
  title: "Checkout demo",
  description: "Simulación del checkout de Sublime. No se procesan pagos ni se generan pedidos.",
  alternates: { canonical: "/checkout" },
};

export default async function CheckoutPage() {
  const catalog = await getStorefrontProducts();
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
