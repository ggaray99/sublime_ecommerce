import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { NewProductForm } from "@/components/admin/products/product-form";
import styles from "@/components/admin/products/product-page.module.css";
import { AdminUnavailable, loadCategoryOptions, themeOptions } from "@/components/admin/shared";
import { Breadcrumbs, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Nuevo producto · Administración",
  robots: { index: false, follow: false },
};

async function NewProduct() {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const categoryOptions = await loadCategoryOptions();

  return (
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Productos", href: "/admin/productos" }, { label: "Nuevo producto" }]} />}
        back={{ href: "/admin/productos", label: "Volver a Productos" }}
        title="Nuevo producto"
        subtitle="El alta queda registrada con quién la hizo."
      />
      <NewProductForm
        initial={{
          name: "",
          slug: "",
          description: "",
          categoryId: categoryOptions[0]?.value ?? "",
          theme: themeOptions[0].value,
          tags: "",
          details: "",
          featured: false,
          catalogCode: "",
          price: "",
          status: "draft",
        }}
        categories={categoryOptions}
        themes={themeOptions}
        uploadsEnabled={hasMediaStorage()}
      />
    </Stack>
  );
}

export default function NewProductPage() {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense
        fallback={
          <Skeleton>
            <Stack gap={4}>
              <SkeletonText lines={2} />
              <SkeletonBlock height={360} />
            </Stack>
          </Skeleton>
        }
      >
        <NewProduct />
      </Suspense>
    </main>
  );
}
