import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { AdminUnavailable, productStatusLabel, stockLabel } from "@/components/admin/shared";
import { RowCheckbox, SelectableTable, SelectAllCheckbox } from "@/components/admin/selectable-table";
import { ExportSelectedButton, SelectionBar } from "@/components/admin/selection-bar";
import { PageIntro } from "@/components/page-intro";
import { themes } from "@/data/products";
import { formatPrice } from "@/lib/format";
import {
  hasActiveFilters,
  LOW_STOCK,
  parseProductSearch,
  productSearchToQuery,
  type ProductSearch,
} from "@/server/admin/product-search";
import type { ProductFacets } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCategoryRepository, getCurrentAdmin } from "@/server/admin/session";
import { PRODUCT_STATUSES } from "@/server/admin/validation";

export const metadata: Metadata = {
  title: "Productos · Administración",
  robots: { index: false, follow: false },
};

type Choice = { value: string; label: string; count?: number };

const withCount = (label: string, count?: number) => (count === undefined ? label : `${label} (${count})`);

function Select({ id, name, label, value, all, choices }: { id: string; name: string; label: string; value?: string; all: string; choices: Choice[] }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">{all}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {withCount(choice.label, choice.count)}
          </option>
        ))}
      </select>
    </div>
  );
}

const SORT_CHOICES: Choice[] = [
  { value: "nombre", label: "Nombre (A-Z)" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "stock-asc", label: "Stock: menor primero" },
  { value: "modificado", label: "Modificados recientemente" },
];

function Filters({ search, facets, categories }: { search: ProductSearch; facets: ProductFacets; categories: Choice[] }) {
  return (
    <aside className="admin-sidebar" aria-labelledby="filtros-title">
      <h2 id="filtros-title" className="admin-sidebar__title">
        Filtros
      </h2>
      <AutoSubmitForm action="/admin/productos" className="admin-sidebar__form">
        <div className="field">
          <label htmlFor="f-q">Buscar</label>
          <input id="f-q" name="q" type="search" defaultValue={search.query} placeholder="Nombre, SKU, código o etiqueta" />
        </div>
        <Select
          id="f-estado"
          name="estado"
          label="Estado"
          value={search.status}
          all={withCount("Todos", facets.total)}
          choices={PRODUCT_STATUSES.map((status) => ({ value: status, label: productStatusLabel[status], count: facets.status[status] }))}
        />
        <Select
          id="f-categoria"
          name="categoria"
          label="Categoría"
          value={search.categoryId}
          all="Todas"
          choices={categories.map((category) => ({ ...category, count: facets.categories[category.value] ?? 0 }))}
        />
        <Select
          id="f-tematica"
          name="tematica"
          label="Temática"
          value={search.theme}
          all="Todas"
          choices={Object.entries(themes).map(([value, label]) => ({ value, label, count: facets.themes[value] ?? 0 }))}
        />
        <Select
          id="f-stock"
          name="stock"
          label="Stock"
          value={search.stock}
          all="Todos"
          choices={[
            { value: "con", label: "Con stock", count: facets.stock.con },
            { value: "bajo", label: `Stock bajo (≤ ${LOW_STOCK})`, count: facets.stock.bajo },
            { value: "sin", label: "Sin stock", count: facets.stock.sin },
            { value: "pedido", label: "A pedido", count: facets.stock.pedido },
          ]}
        />
        <Select
          id="f-imagenes"
          name="imagenes"
          label="Imágenes"
          value={search.images}
          all="Todas"
          choices={[
            { value: "con", label: "Con fotos", count: facets.images.con },
            { value: "sin", label: "Sin fotos", count: facets.images.sin },
          ]}
        />
        <Select
          id="f-destacado"
          name="destacado"
          label="Destacado"
          value={search.featured}
          all="Todos"
          choices={[
            { value: "si", label: "Destacados", count: facets.featured.si },
            { value: "no", label: "No destacados", count: facets.featured.no },
          ]}
        />
        {/* Keep the chosen order when filtering (the order selector is at the top). */}
        {search.sort !== "orden" && <input type="hidden" name="orden" value={search.sort} />}
        <div className="admin-sidebar__actions">
          <button type="submit" className="btn btn--coal">
            Aplicar
          </button>
          {hasActiveFilters(search) && (
            <Link href="/admin/productos" className="link-button">
              Limpiar filtros
            </Link>
          )}
        </div>
      </AutoSubmitForm>
    </aside>
  );
}

/** Order selector at the top; it keeps the active filters. */
function SortControl({ search }: { search: ProductSearch }) {
  const keep = new URLSearchParams(productSearchToQuery({ ...search, sort: "orden", page: 1 }).slice(1));
  return (
    <AutoSubmitForm action="/admin/productos" className="admin-sort">
      {[...keep.entries()].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="f-orden">Ordenar por</label>
      <select id="f-orden" name="orden" defaultValue={search.sort === "orden" ? "" : search.sort}>
        <option value="">Orden de la tienda</option>
        {SORT_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn--coal">
          Ordenar
        </button>
      </noscript>
    </AutoSubmitForm>
  );
}

function Pagination({ search, page, pages }: { search: ProductSearch; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="admin-pagination" aria-label="Páginas">
      {page > 1 ? <Link href={`/admin/productos${productSearchToQuery(search, { page: page - 1 })}`}>← Anterior</Link> : <span />}
      <span>
        Página {page} de {pages}
      </span>
      {page < pages ? <Link href={`/admin/productos${productSearchToQuery(search, { page: page + 1 })}`}>Siguiente →</Link> : <span />}
    </nav>
  );
}

async function AdminContent({ searchParams }: { searchParams: PageProps<"/admin/productos">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const search = parseProductSearch(await searchParams);
  const repo = getAdminRepository();
  const [result, facets, categoryList] = await Promise.all([
    repo.searchProducts(search),
    repo.productFacets(),
    getCategoryRepository().listCategories(),
  ]);
  const categories = categoryList.map((category) => ({
    value: category.id,
    label: category.active ? category.label : `${category.label} (oculta)`,
  }));
  const first = (result.page - 1) * result.pageSize + 1;

  return (
    <div className="account account--wide">
      <div className="account__head">
        <div className="admin-toolbar">
          <SortControl search={search} />
          <p className="muted">
            Sesión: {admin.email} · rol {admin.role === "owner" ? "dueño" : "editor"}
          </p>
        </div>
      </div>

      <div className="admin-layout">
        <Filters search={search} facets={facets} categories={categories} />

        <section className="account__section admin-layout__main" aria-labelledby="productos-title">
          <div className="account__head">
            <h2 id="productos-title">Productos</h2>
            <div className="admin-toolbar">
              {/* A plain link: the browser downloads the file. */}
              <a href="/admin/productos/exportar" download>
                Exportar planilla
              </a>
              <Link href="/admin/productos/importar">Importar planilla</Link>
              <Link className="btn btn--acid" href="/admin/productos/nuevo">
                Nuevo producto
              </Link>
            </div>
          </div>

          <p className="muted" role="status">
            {result.total
              ? `${result.total} ${result.total === 1 ? "producto" : "productos"}${result.pages > 1 ? ` · mostrando ${first}–${first + result.items.length - 1}` : ""}`
              : "No hay productos con estos filtros."}
          </p>

          {result.items.length > 0 && (
            // A new page, filter or order starts with nothing selected (key).
            <SelectableTable key={productSearchToQuery(search)} ids={result.items.map((product) => product.id)}>
            <SelectionBar hint={result.pages > 1 ? "La selección vale para los productos de esta página." : undefined}>
              <ExportSelectedButton endpoint="/admin/productos/exportar" />
            </SelectionBar>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--selectable">
                <thead>
                  <tr>
                    <th scope="col" className="admin-table__select">
                    <SelectAllCheckbox />
                  </th>
                  <th scope="col">
                      <span className="visually-hidden">Imagen</span>
                    </th>
                    <th scope="col">Producto</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Stock disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((product) => {
                    const available = product.onHand - product.reserved;
                    return (
                      <tr key={product.id} className={product.trackStock && available <= LOW_STOCK ? "is-low" : undefined}>
                        <td className="admin-table__select">
                          <RowCheckbox id={product.id} label={product.name} />
                        </td>
                        <td className="admin-table__thumb">
                          <Image src={product.coverUrl} alt="" width={56} height={56} />
                        </td>
                        <th scope="row">
                          <Link href={`/admin/productos/${product.id}`}>{product.name}</Link>
                          {product.featured && <span className="badge badge--acid">Destacado</span>}
                          {product.optionNames.length > 0 && (
                            <span className="muted">
                              {" "}
                              · {product.variantCount} variantes ({product.optionNames.join(", ").toLowerCase()})
                            </span>
                          )}
                          {product.status === "active" && (
                            <>
                              {" · "}
                              <Link href={`/producto/${product.slug}`} className="admin-table__store">
                                Ver<span className="visually-hidden"> {product.name}</span> en la tienda
                              </Link>
                            </>
                          )}
                        </th>
                        <td>{categories.find((category) => category.value === product.categoryId)?.label ?? product.categoryId}</td>
                        <td>{product.sku}</td>
                        <td>{productStatusLabel[product.status]}</td>
                        <td>{product.priceMinor === null ? "A presupuestar" : formatPrice(product.priceMinor / 100)}</td>
                        <td>{stockLabel(product)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </SelectableTable>
          )}
          <Pagination search={search} page={result.page} pages={result.pages} />
        </section>
      </div>

</div>
  );
}

export default function ProductsPage({ searchParams }: PageProps<"/admin/productos">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Interno" title="Productos" tone="light">
        <p>Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando el panel…</p>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
