import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { AdminUnavailable } from "@/components/admin/shared";
import { SelectableTable, SelectAllCheckbox, RowCheckbox } from "@/components/admin/selectable-table";
import { SelectionBar } from "@/components/admin/selection-bar";
import {
  adminThemeClassName,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  cx,
  DataTable,
  EmptyState,
  FilterBar,
  FormSection,
  Inline,
  Input,
  LinkTabs,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  SkeletonBlock,
  SkeletonText,
  Stack,
  Textarea,
  type BadgeTone,
  type DataTableColumn,
} from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { DialogDemo, LoadingButtonDemo, ToastDemo } from "./demos";
import styles from "./showcase.module.css";

export const metadata: Metadata = {
  title: "Sistema de diseño · Administración",
  robots: { index: false, follow: false },
};

const HERE = "/admin/sistema-de-diseno";

/* Sample rows: fictitious and labelled "Ejemplo" everywhere they show. */
type SampleRow = { id: string; name: string; status: { label: string; tone: BadgeTone }; stock: number; price: string };
const SAMPLE_ROWS: SampleRow[] = [
  { id: "ejemplo-1", name: "Ejemplo · Taza blanca", status: { label: "Publicado", tone: "success" }, stock: 24, price: "$ 0,00" },
  { id: "ejemplo-2", name: "Ejemplo · Remera algodón", status: { label: "Borrador", tone: "neutral" }, stock: 3, price: "$ 0,00" },
  { id: "ejemplo-3", name: "Ejemplo · Sticker troquelado", status: { label: "En revisión", tone: "warning" }, stock: 0, price: "$ 0,00" },
];

const COLUMNS: DataTableColumn<SampleRow>[] = [
  { key: "name", header: "Producto", cell: (row) => row.name, rowHeader: true },
  { key: "status", header: "Estado", cell: (row) => <Badge tone={row.status.tone}>{row.status.label}</Badge>, nowrap: true },
  { key: "stock", header: "Stock", cell: (row) => row.stock, align: "end", width: "96px" },
  { key: "price", header: "Precio", cell: (row) => row.price, align: "end", width: "120px", nowrap: true },
];

const SELECT_COLUMN: DataTableColumn<SampleRow> = {
  key: "select",
  header: <SelectAllCheckbox />,
  cell: (row) => <RowCheckbox id={row.id} label={row.name} />,
  width: "48px",
};

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: "Neutros",
    tokens: ["canvas", "surface", "surface-subdued", "surface-hover", "surface-selected", "border", "border-strong", "border-input", "text", "text-subdued", "text-disabled", "text-link"],
  },
  { title: "Acción y marca", tokens: ["primary", "primary-hover", "accent", "accent-subdued", "focus", "critical-strong", "inverse-surface"] },
  {
    title: "Estados (fondo, borde, texto, ícono)",
    tokens: ["info-bg", "info-border", "info-text", "info-icon", "success-bg", "success-border", "success-text", "success-icon", "warning-bg", "warning-border", "warning-text", "warning-icon", "critical-bg", "critical-border", "critical-text", "critical-icon", "attention-bg", "attention-border", "attention-text", "attention-icon"],
  },
];

const TYPE_SCALE = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const SPACE_SCALE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;
const RADII = ["sm", "md", "lg", "full"] as const;
const SHADOWS = ["card", "popover", "dialog"] as const;
const BADGE_TONES: { tone: BadgeTone; label: string }[] = [
  { tone: "neutral", label: "Neutral" },
  { tone: "info", label: "Info" },
  { tone: "success", label: "Éxito" },
  { tone: "warning", label: "Advertencia" },
  { tone: "critical", label: "Crítico" },
  { tone: "attention", label: "Atención" },
];

const tokenStyle = (property: string, value: string) => ({ [property]: value }) as CSSProperties;

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card section id={id} title={title}>
      {description && <p className={styles.muted}>{description}</p>}
      {children}
    </Card>
  );
}

async function Showcase() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  return (
    <div className={cx(adminThemeClassName, styles.canvas)}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Sistema de diseño" }]} />}
        back={{ href: "/admin", label: "Volver a Productos" }}
        title="Sistema de diseño"
        meta={<Badge tone="info">Solo administradores</Badge>}
        subtitle="Tokens y componentes de Sublime Admin. Todos los datos de esta página son de ejemplo."
        secondaryActions={<Button>Acción secundaria</Button>}
        primaryAction={<Button variant="primary">Acción principal</Button>}
      />

      <Stack gap={6}>
        <Section id="color" title="Color" description="Tokens --sa-color-*. Los pares de texto y fondo tienen contraste AA verificado por los tests.">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className={styles.group}>
              <h3 className={styles.subheading}>{group.title}</h3>
              <ul className={styles.swatches}>
                {group.tokens.map((token) => (
                  <li key={token} className={styles.swatch}>
                    <span className={styles.chip} style={tokenStyle("background", `var(--sa-color-${token})`)} aria-hidden="true" />
                    <code className={styles.code}>--sa-color-{token}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section id="tipografia" title="Tipografía" description="Gontserrat (la fuente de texto de la tienda, ya cargada) con fallback del sistema. Pesos 400, 600 y 700.">
          <ul className={styles.plainList}>
            {TYPE_SCALE.map((size) => (
              <li key={size} className={styles.typeRow}>
                <code className={styles.code}>--sa-font-size-{size}</code>
                <span style={{ fontSize: `var(--sa-font-size-${size})`, lineHeight: `var(--sa-line-height-${size})` }}>Pedidos pendientes de pago</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="espaciado" title="Espaciado, radios y sombras" description="Escala de 4 px. Radios de 6, 8 y 12 px. Sombras suaves para tarjetas, menús y diálogos.">
          <ul className={styles.plainList}>
            {SPACE_SCALE.map((step) => (
              <li key={step} className={styles.typeRow}>
                <code className={styles.code}>--sa-space-{step}</code>
                <span className={styles.spaceBar} style={{ width: `var(--sa-space-${step})` }} aria-hidden="true" />
              </li>
            ))}
          </ul>
          <div className={styles.tiles}>
            {RADII.map((radius) => (
              <div key={radius} className={styles.tile} style={{ borderRadius: `var(--sa-radius-${radius})` }}>
                <code className={styles.code}>--sa-radius-{radius}</code>
              </div>
            ))}
            {SHADOWS.map((shadow) => (
              <div key={shadow} className={cx(styles.tile, styles.shadowTile)} style={{ boxShadow: `var(--sa-shadow-${shadow})` }}>
                <code className={styles.code}>--sa-shadow-{shadow}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section id="botones" title="Button" description="Variantes primary, secondary, tertiary y critical; tamaños sm y md; carga, deshabilitado, solo ícono y como enlace.">
          <Inline gap={2}>
            <Button variant="primary">Primario</Button>
            <Button>Secundario</Button>
            <Button variant="tertiary">Terciario</Button>
            <Button variant="critical">Eliminar</Button>
          </Inline>
          <Inline gap={2}>
            <Button variant="primary" size="sm">
              Primario sm
            </Button>
            <Button size="sm">Secundario sm</Button>
            <Button variant="tertiary" size="sm">
              Terciario sm
            </Button>
            <Button variant="critical" size="sm">
              Eliminar sm
            </Button>
          </Inline>
          <Inline gap={2}>
            <LoadingButtonDemo />
            <Button loading>Cargando</Button>
            <Button disabled>Deshabilitado</Button>
            <Button variant="primary" disabled>
              Primario deshabilitado
            </Button>
            <Button iconOnly aria-label="Ver más acciones" icon={<span className={styles.dots}>···</span>} />
            <Button href={HERE}>Enlace con forma de botón</Button>
          </Inline>
        </Section>

        <Section id="insignias" title="Badge" description="Tonos neutral, info, success, warning, critical y attention, con o sin punto. El texto siempre lleva el significado.">
          <Inline gap={2}>
            {BADGE_TONES.map(({ tone, label }) => (
              <Badge key={tone} tone={tone}>
                {label}
              </Badge>
            ))}
          </Inline>
          <Inline gap={2}>
            {BADGE_TONES.map(({ tone, label }) => (
              <Badge key={tone} tone={tone} dot>
                {label}
              </Badge>
            ))}
          </Inline>
        </Section>

        {/* A GET form to this same page: the example never saves anything. */}
        <form action={HERE} method="get" className={styles.formStack} aria-label="Formulario de ejemplo">
          <FormSection
            id="campos"
            title="Input, Select y Textarea"
            description={<p>Sección de formulario al estilo de Ajustes: título y descripción a la izquierda, campos a la derecha. Se apila en pantallas angostas.</p>}
            footer={<Button type="button">Guardar (ejemplo)</Button>}
          >
            <Input label="Nombre del producto" name="ejemplo-nombre" required hint="Se muestra en la tienda y en los pedidos." />
            <Input label="Precio" name="ejemplo-precio" inputMode="decimal" prefix="$" suffix="ARS" defaultValue="0,00" />
            <Input label="Código" name="ejemplo-codigo" defaultValue="SUB 1" error="El código no puede tener espacios." />
            <Input label="Creado por" name="ejemplo-creado" defaultValue="Ejemplo" disabled />
            <Select
              label="Estado"
              name="ejemplo-estado"
              placeholder="Elegí un estado"
              options={[
                { value: "active", label: "Publicado" },
                { value: "draft", label: "Borrador" },
                { value: "archived", label: "Archivado" },
              ]}
            />
            <Select label="Categoría" name="ejemplo-categoria" error="Elegí una categoría." required options={[{ value: "", label: "Sin categoría" }]} />
            <Textarea label="Descripción" name="ejemplo-descripcion" hint="Texto plano; los saltos de línea se respetan." />
          </FormSection>
        </form>

        <Card section id="listas" title="FilterBar, DataTable y Pagination" padding="none">
          <FilterBar
            action={HERE}
            tabs={
              <LinkTabs
                label="Filtrar por estado (ejemplo)"
                tabs={[
                  { label: "Todos", href: HERE, current: true, count: 3 },
                  { label: "Publicados", href: `${HERE}?estado=active`, count: 1 },
                  { label: "Archivados", href: `${HERE}?estado=archived`, count: 0 },
                ]}
              />
            }
            search={{ label: "Buscar productos de ejemplo", placeholder: "Buscar por nombre o SKU" }}
            filters={
              <Select
                label="Stock"
                labelHidden
                name="stock"
                placeholder="Todo el stock"
                options={[
                  { value: "low", label: "Stock bajo" },
                  { value: "out", label: "Sin stock" },
                ]}
              />
            }
            clearHref={HERE}
          />
          <SelectableTable ids={SAMPLE_ROWS.map((row) => row.id)}>
            <div className={styles.selectionBar}>
              <SelectionBar hint="Ejemplo: las acciones sobre la selección no hacen nada en esta página.">
                <Button size="sm" disabled>
                  Exportar (ejemplo)
                </Button>
              </SelectionBar>
            </div>
            <DataTable
              caption="Productos de ejemplo (datos ficticios)"
              columns={[SELECT_COLUMN, ...COLUMNS]}
              rows={SAMPLE_ROWS}
              rowKey={(row) => row.id}
              rowHref={(row) => `${HERE}?fila=${row.id}#listas`}
              rowTone={(row) => (row.stock === 0 ? "critical" : undefined)}
            />
          </SelectableTable>
          <Pagination page={2} pageSize={3} total={9} baseHref={HERE} searchParams={{ estado: "active" }} />
        </Card>

        <div className={styles.grid}>
          <Card title="DataTable vacía" padding="none">
            <DataTable
              caption="Tabla vacía (ejemplo)"
              captionHidden
              columns={COLUMNS}
              rows={[]}
              rowKey={(row) => row.id}
              empty={
                <EmptyState heading="No hay productos con estos filtros" headingLevel={3} action={<Button href={HERE}>Limpiar filtros</Button>}>
                  <p>Probá con otra búsqueda o quitá los filtros.</p>
                </EmptyState>
              }
            />
          </Card>
          <Card title="DataTable cargando" padding="none">
            <DataTable caption="Tabla cargando (ejemplo)" captionHidden columns={COLUMNS} rows={[]} rowKey={(row) => row.id} loading loadingRows={3} />
          </Card>
        </div>

        <Card title="DataTable con encabezado fijo" padding="none">
          <DataTable
            caption="Encabezado fijo con desplazamiento interno (ejemplo)"
            columns={COLUMNS}
            rows={[...SAMPLE_ROWS, ...SAMPLE_ROWS, ...SAMPLE_ROWS].map((row, index) => ({ ...row, id: `${row.id}-${index}` }))}
            rowKey={(row) => row.id}
            stickyHeader
            maxHeight="220px"
          />
        </Card>

        <div className={styles.grid}>
          <EmptyState appearance="card" heading="Todavía no hay pedidos" action={<Button variant="primary">Acción de ejemplo</Button>}>
            <p>Cuando entren pedidos de la tienda, se van a listar acá.</p>
          </EmptyState>
          <EmptyState appearance="card" variant="unavailable" heading="Ventas de los últimos 30 días">
            <p>El panel todavía no calcula esta métrica. No se muestra ningún número para no confundirlo con un dato real.</p>
          </EmptyState>
        </div>

        <Section id="esqueletos" title="Skeleton" description="Formas de carga ocultas a lectores de pantalla; el contenedor anuncia «Cargando…» una vez.">
          <div className={styles.grid}>
            <Skeleton label="Cargando texto de ejemplo…">
              <SkeletonText lines={4} />
            </Skeleton>
            <Skeleton label="Cargando imagen de ejemplo…">
              <SkeletonBlock height={96} />
            </Skeleton>
          </div>
        </Section>

        <Section id="dialogos" title="Dialog" description="Diálogo modal nativo: Escape o el botón Cerrar lo cierran y el foco vuelve al botón que lo abrió.">
          <DialogDemo />
        </Section>

        <Section id="avisos" title="Toast" description="Avisos en una región aria-live «polite». Se cierran solos a los 5 s (se pausan con el mouse o el foco); los de error quedan hasta cerrarlos.">
          <ToastDemo />
        </Section>

        <Section id="migas" title="Breadcrumbs">
          <Breadcrumbs
            items={[
              { label: "Administración", href: "/admin" },
              { label: "Ejemplo · Pedidos", href: HERE },
              { label: "Ejemplo · SUB-0000" },
            ]}
          />
        </Section>
      </Stack>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main id="contenido" className="page page--light">
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Showcase />
      </Suspense>
    </main>
  );
}
