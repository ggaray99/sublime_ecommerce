import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOutAction } from "@/app/cuenta/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { BrandLogo } from "@/components/brand-logo";
import { startPreviewAction } from "@/app/admin/ajustes/actions";
import { getCurrentAdmin } from "@/server/admin/session";
import { getStoreStatusRepository } from "@/server/settings/session";

/**
 * Admin bar: only for signed-in admins. The CSS hides the store header, cart and
 * footer while it is on the page (body:has(.admin-bar)). Everyone else gets the
 * normal store 404 from the pages, so the panel's existence is not revealed.
 */
async function AdminBar() {
  await connection();
  const admin = await getCurrentAdmin().catch(() => null);
  if (!admin) return null;
  const { closed } = await getStoreStatusRepository()
    .get()
    .catch(() => ({ closed: false }));
  return (
    <header className="admin-bar">
      <BrandLogo className="brand-logo--admin" />
      <p className="admin-bar__title">Administración</p>
      <div className="admin-bar__actions">
        <span className="admin-bar__user">{admin.email}</span>
        <Link href="/admin/ajustes#estado" className={`badge ${closed ? "badge--pending" : "badge--ok"}`}>
          {closed ? "Tienda cerrada" : "Tienda abierta"}
        </Link>
        {closed ? (
          // Closed: only admins in preview see the real store.
          <form action={startPreviewAction}>
            <button type="submit" className="btn btn--acid">
              Ver la tienda (vista previa) →
            </button>
          </form>
        ) : (
          <Link className="btn btn--acid" href="/">
            Ir a la tienda →
          </Link>
        )}
        <form action={signOutAction}>
          <button type="submit" className="link-button">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}

/** The side menu, also only for signed-in admins. */
async function AdminSideNav() {
  await connection();
  const admin = await getCurrentAdmin().catch(() => null);
  return admin ? <AdminNav /> : null;
}

/**
 * While the session is checked, an empty bar holds the place of the admin bar:
 * it carries the .admin-bar class, so the store header and footer stay hidden
 * instead of flashing in. It shows nothing about the panel; strangers then get
 * the normal store 404 with the store chrome back.
 */
const LOADING_BAR = <div className="admin-bar admin-bar--loading" aria-hidden="true" />;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-shell">
      <Suspense fallback={LOADING_BAR}>
        <AdminBar />
      </Suspense>
      <div className="admin-body">
        <Suspense fallback={null}>
          <AdminSideNav />
        </Suspense>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
