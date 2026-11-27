import { Suspense } from "react";
import { AdminShell, AdminShellContent, AdminSidebar, AdminTopbar, AdminTopbarPlaceholder } from "@/components/admin/shell/admin-shell";

/**
 * Admin layout: top bar, sidebar and page inside the design system's shell
 * (docs/admin-design-system.md). The bar and the menu render only for
 * signed-in admins; every page keeps its own guard (store 404 for strangers).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AdminShell>
      <Suspense fallback={<AdminTopbarPlaceholder />}>
        <AdminTopbar />
      </Suspense>
      <Suspense fallback={null}>
        <AdminSidebar />
      </Suspense>
      <AdminShellContent>{children}</AdminShellContent>
    </AdminShell>
  );
}
