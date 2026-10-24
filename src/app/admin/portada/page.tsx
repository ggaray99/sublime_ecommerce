import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { HomeHeroForm } from "@/components/admin/home-forms";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getHomeRepository } from "@/server/home/session";
import { pickHeroProducts } from "@/server/home/settings";
import { getStorefrontProducts } from "@/server/storefront";

export const metadata: Metadata = {
  title: "Portada · Administración",
  robots: { index: false, follow: false },
};

async function HomeSettings() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const [hero, products] = await Promise.all([getHomeRepository().getHero(), getStorefrontProducts()]);
  const options = products
    .map((product) => ({ value: product.id, label: product.code ? `${product.name} · cód. ${product.code}` : product.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const [product1 = "", product2 = "", product3 = ""] = hero.productIds;
  // What the home shows right now, slot by slot (chosen products first, then the usual ones).
  const current = pickHeroProducts(hero, products).map((product) => ({
    name: product.name,
    image: product.images[0]?.src ?? "",
    chosen: hero.productIds.includes(product.id),
  }));

  return (
    <div className="account account--wide">
      <AdminNav current="portada" />
      <section className="account__section" aria-labelledby="portada-title">
        <div className="account__head">
          <h2 id="portada-title">Primera sección de la tienda</h2>
          <Link href="/">Ver la portada →</Link>
        </div>
        <p className="muted">Lo primero que ve la gente al entrar: título, texto, botones y el collage de tres productos.</p>
        <HomeHeroForm
          initial={{
            kicker: hero.kicker,
            titleLine1: hero.titleLine1,
            titleLine2: hero.titleLine2,
            lede: hero.lede,
            primaryLabel: hero.primaryLabel,
            primaryHref: hero.primaryHref,
            secondaryLabel: hero.secondaryLabel,
            secondaryHref: hero.secondaryHref,
            stamp: hero.stamp,
            product1,
            product2,
            product3,
          }}
          products={options}
          current={current}
        />
      </section>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="PORTADA." tone="light">
        <p>Qué se muestra arriba de todo en la página de inicio.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <HomeSettings />
      </Suspense>
    </main>
  );
}
