import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Carrito demo",
  description: "Carrito de prueba de Sublime: agregá, quitá y modificá cantidades sin compras reales.",
  alternates: { canonical: "/carrito" },
};

export default function CarritoPage() {
  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Carrito de prueba"
        title={
          <>
            TU SELECCIÓN <em>DEMO.</em>
          </>
        }
      >
        <p>El carrito se guarda solo en este navegador y no contiene datos personales.</p>
      </PageIntro>
      <CartView />
    </main>
  );
}
