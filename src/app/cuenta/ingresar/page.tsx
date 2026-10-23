import type { Metadata } from "next";
import { AuthForm } from "@/components/account/forms";
import { AccountsUnavailable } from "@/components/account/unavailable";
import { PageIntro } from "@/components/page-intro";
import { accountsAvailable } from "@/server/customers/session";

export const metadata: Metadata = {
  title: "Ingresar",
  description: "Ingresá a tu cuenta de Sublime.",
  alternates: { canonical: "/cuenta/ingresar" },
};

export default function IngresarPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Mi cuenta" title="INGRESAR." tone="light">
        <p>Entrá para guardar tus datos y direcciones de entrega.</p>
      </PageIntro>
      {accountsAvailable() ? <AuthForm mode="signin" /> : <AccountsUnavailable />}
    </main>
  );
}
