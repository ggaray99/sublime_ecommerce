import type { Metadata } from "next";
import { CheckoutDemo } from "@/components/cart/checkout-demo";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Checkout demo",
  description: "Simulación del checkout de Sublime. No se procesan pagos ni se generan pedidos.",
  alternates: { canonical: "/checkout" },
};

export default function CheckoutPage() {
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
      <CheckoutDemo />
    </main>
  );
}
