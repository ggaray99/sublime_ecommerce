import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/cuenta/actions";
import { startPreviewAction } from "@/app/admin/ajustes/actions";
import { BrandLogo } from "@/components/brand-logo";
import { getCurrentAdmin } from "@/server/admin/session";
import { getStoreStatusRepository } from "@/server/settings/session";
import { adminThemeClassName, Badge, Button, cx } from "../ui";
import { ShellProviders, SidebarMenuButton } from "./shell-state";
import { Sidebar } from "./sidebar";
import styles from "./shell.module.css";

/**
 * Root of the admin panel: top bar across, sidebar on the left, the page on
 * the right, on the design system's canvas. Keeps the `admin-shell` class:
 * the current page styles (globals.css) and the rule that hides the store
 * header and footer (body:has(.admin-shell .admin-bar)) depend on it.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className={cx("admin-shell", adminThemeClassName, styles.shell)}>
      <ShellProviders>{children}</ShellProviders>
    </div>
  );
}

/**
 * Where the page goes. Current pages bring their own <main id="contenido"
 * class="page">; `admin-content` gives it the panel's side padding (globals.css).
 */
export function AdminShellContent({ children }: { children: ReactNode }) {
  return <div className={cx("admin-content", styles.content)}>{children}</div>;
}

/**
 * Top bar, only for signed-in admins. It carries the `admin-bar` class, so the
 * store header, cart and footer stay hidden while it is on the page. Everyone
 * else gets the normal store 404 from the pages: the panel is not revealed.
 */
export async function AdminTopbar() {
  await connection();
  const admin = await getCurrentAdmin().catch(() => null);
  if (!admin) return null;
  const { closed } = await getStoreStatusRepository()
    .get()
    .catch(() => ({ closed: false }));
  return (
    <header className={cx("admin-bar", styles.topbar)}>
      <div className={styles.topbarStart}>
        <SidebarMenuButton />
        <BrandLogo className={styles.logo} />
        <p className={styles.title}>Administración</p>
      </div>
      <div className={styles.topbarEnd}>
        <Link href="/admin/ajustes#estado" className={styles.status}>
          <Badge tone={closed ? "attention" : "success"} dot>
            {closed ? "Tienda cerrada" : "Tienda abierta"}
          </Badge>
        </Link>
        {closed ? (
          // Closed: only admins in preview see the real store.
          <form action={startPreviewAction}>
            <Button type="submit" size="sm">
              Ver la tienda (vista previa) →
            </Button>
          </form>
        ) : (
          <Button href="/" size="sm">
            Ir a la tienda →
          </Button>
        )}
        <span className={styles.user}>{admin.email}</span>
        <form action={signOutAction}>
          <button type="submit" className={styles.signOut}>
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}

/**
 * While the session is checked, an empty bar holds the place of the top bar:
 * it carries the `admin-bar` class, so the store header and footer stay hidden
 * instead of flashing in. It shows nothing about the panel; strangers then get
 * the normal store 404 with the store chrome back.
 */
export function AdminTopbarPlaceholder() {
  return <div className={cx("admin-bar", styles.topbar)} aria-hidden="true" />;
}

/** The side menu, also only for signed-in admins (Integraciones only for owners). */
export async function AdminSidebar() {
  await connection();
  const admin = await getCurrentAdmin().catch(() => null);
  return admin ? <Sidebar role={admin.role} /> : null;
}
