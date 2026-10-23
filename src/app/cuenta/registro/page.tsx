import type { Metadata } from "next";
import { AuthForm } from "@/components/account/forms";
import { AccountsUnavailable } from "@/components/account/unavailable";
import { PageIntro } from "@/components/page-intro";
import { accountsAvailable } from "@/server/customers/session";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Creá tu cuenta de Sublime.",
  alternates: { canonical: "/cuenta/registro" },
};

export default function RegistroPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Mi cuenta" title="CREAR CUENTA." tone="light">
        <p>Con una cuenta vas a poder guardar tus datos y direcciones para próximas compras.</p>
      </PageIntro>
      {accountsAvailable() ? <AuthForm mode="signup" /> : <AccountsUnavailable />}
    </main>
  );
}
