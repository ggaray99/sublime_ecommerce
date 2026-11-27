# Sublime Admin design system

The admin panel's own visual language: Modern SaaS, with Shopify Admin as the UX reference (calm neutral surfaces, white cards on a light grey canvas, 13–14px UI text, subtle shadows, clear focus rings). The public store keeps its brutalist identity; nothing here reaches it.

- **Code:** `src/components/admin/ui/` (one file per component plus its `*.module.css`; barrel `index.ts`).
- **Showcase:** `/admin/sistema-de-diseno` renders every component and variant (admins only; non-admins get the store 404). All data on it is labelled as an example.
- **Tests:** `tests/admin-ui.test.mjs` covers the pure helpers and checks the contrast of every token pair listed below.

## How it is built

| Decision | Why |
|---|---|
| CSS Modules per component | Class names are scoped by construction, so no admin style can leak into the store. No Tailwind utilities, no UI library. |
| Tokens as CSS custom properties on one class (`tokens.module.css` → `.theme`, exported as `adminThemeClassName`) | Components read only `var(--sa-…)`. The admin shell root carries the class, so every admin page gets the theme. Every token is prefixed `--sa-` (Sublime Admin). |
| Server components by default | Only `Dialog`, `Toast` (and `useDialog`/`useToast`) are client components. `DataTable`, `FilterBar`, `Pagination` and the rest render on the server and ship no JavaScript. |
| Native elements first | `<dialog>` with `showModal()`, native `<select>`, `<form method="get">` filters, link tabs. They work with the keyboard and without JavaScript where possible. |

### Using it

```tsx
import { adminThemeClassName, Button, Card, PageHeader } from "@/components/admin/ui";

export default function Page() {
  return (
    <div className={adminThemeClassName}>
      <PageHeader title="Pedidos" primaryAction={<Button variant="primary" href="/admin/pedidos/nuevo">Nuevo pedido</Button>} />
      <Card title="Resumen">…</Card>
    </div>
  );
}
```

Components only look right inside an element with `adminThemeClassName` (it defines the tokens); inside /admin the shell already provides it. `Dialog` and `ToastProvider` must also be rendered inside it: the top layer keeps inheriting custom properties from the DOM ancestors.

## Admin shell (layout)

`src/components/admin/shell/`, used by `src/app/admin/layout.tsx`. The root carries `admin-shell` (current page styles and the store-chrome rule depend on it) plus `adminThemeClassName`, so every admin page is inside the theme; it also holds the panel's single `ToastProvider`. Pages do not add the theme class or a provider themselves.

| Part | File | Notes |
|---|---|---|
| `AdminShell` | `admin-shell.tsx` | CSS grid: top bar across, sidebar left, page right, on `--sa-color-canvas`. Current pages keep the store's 1.5 line height inside it; `.admin-shell .admin-content > .page` (globals.css) gives their `<main class="page">` the side padding. |
| `AdminTopbar` | `admin-shell.tsx` | Inverse (dark) surface, 56px, sticky. Logo, "Administración", store status badge → `/admin/ajustes#estado`, "Ir a la tienda →" or, with the store closed, "Ver la tienda (vista previa) →" (`startPreviewAction`), email, "Salir" (`signOutAction`). Root class `admin-bar`: while it is on the page the store header, cart and footer are hidden. Only for admins. |
| `AdminTopbarPlaceholder` | `admin-shell.tsx` | Suspense fallback: an empty bar with `admin-bar`, so the store chrome does not flash while the session is checked. Shows nothing about the panel. |
| `Sidebar` / `AdminSidebar` | `sidebar.tsx`, `admin-shell.tsx` | 240px, white, "Inicio" first, then Ventas / Catálogo / Tienda / Sistema. Current item: selected background + semibold. Footer: "Sistema de diseño" link (the showcase stays out of the groups) and "Contraer menú". Folded (≥ 900px): 56px rail; names show as tooltips on hover and keyboard focus (`position: fixed`, so the menu's scroll box does not cut them; no ancestor may get a transform or filter). The choice is stored in `localStorage["sublime-admin-nav"]`. Below 900px: hidden; the top bar's menu button opens it over the page with a backdrop; a section link, Escape or a click outside closes it (Escape returns focus to the button). |
| Menu data | `nav-items.ts` | Plain data, tested: `navGroups(role)` hides "Integraciones (API)" from editors (the page answers 404 to them); `isCurrentLink()` matches the section and its sub-pages; Inicio (`match: "exact"`) only at `/admin`. `legacyProductsHref()` maps old product-list links (`/admin?stock=bajo`) to `/admin/productos?…`. |
| Shared state | `shell-state.tsx` | `ShellProviders` (sidebar state + `ToastProvider`), `useShellNav()`, `SidebarMenuButton`. |

Breadcrumbs are used where they are cheap (the showcase page). Current pages keep their own headers until they are redesigned.

### Dashboard (`/admin`)

`src/app/admin/page.tsx` with `src/server/admin/dashboard.ts` (`loadDashboard(sql)`, `attentionGroups()`; tested in `tests/admin-dashboard.test.mjs`). Same guard as the other pages; a `Skeleton` while it loads.

Routes: `/admin` is the dashboard and the panel's landing page; the products list lives at `/admin/productos`. `/admin` with a query (old product-list links and bookmarks such as `/admin?stock=bajo`) redirects, after the admin check, to `/admin/productos` with the same query. `/admin/inicio` (the stage-1 address) redirects to `/admin` (`next.config.ts`, temporary redirect).

- **Para atender**: Pedidos (pendientes de pago, en revisión, pago confirmado sin enviar), Encargos (recibidos sin presupuesto), Stock (sin stock, stock bajo). Counts come from the same queries as the lists (`countByStatus`, `productFacets`) and each row links to the filtered list (`/admin/pedidos?estado=…`, `/admin/encargos?estado=received`, `/admin/productos?stock=sin|bajo`). Like the orders list, it first releases expired reservations. A card with nothing to do shows an `EmptyState`.
- **Ventas**: `EmptyState variant="unavailable"`: there is no sales reporting yet, so no numbers are shown.
- **Actividad reciente**: the last 5 audit entries (`AuditList`) and a link to `/admin/actividad`.

### Coexisting with the current admin theme

The current admin theme (`.admin-shell …` rules at the end of `src/app/globals.css`) still styles the existing pages. It contains element selectors such as `.admin-shell h1, .admin-shell h2, .admin-shell h3` (specificity 0,1,1), which beat a single module class (0,1,0). For that reason the headings inside the components are styled through a two-class selector (for example `.header .title`) and set their font, size, weight, line height and letter spacing explicitly. Follow the same rule when you add a heading to a component.

## Tokens

All tokens live on `.theme` in `src/components/admin/ui/tokens.module.css`.

### Color

Contrast is the WCAG 2.x ratio, computed from the token values (`contrast.ts`) and asserted by the tests: text ≥ 4.5:1, non-text UI (focus ring, field borders, icons) ≥ 3:1.

#### Neutrals

| Token | Value | Use |
|---|---|---|
| `--sa-color-canvas` | `#f1f1f3` | Page background behind the cards |
| `--sa-color-surface` | `#ffffff` | Cards, tables, inputs, dialogs |
| `--sa-color-surface-subdued` | `#f7f7f8` | Table header, disabled controls, row hover |
| `--sa-color-surface-hover` | `#f1f1f3` | Hover of secondary buttons and links |
| `--sa-color-surface-pressed` | `#e8e8eb` | Pressed state; skeleton base |
| `--sa-color-surface-selected` | `#ebebee` | Selected item (menus, rows) |
| `--sa-color-border` | `#e3e3e6` | Dividers, card and table separators |
| `--sa-color-border-strong` | `#c9cacf` | Secondary button and badge borders |
| `--sa-color-border-input` | `#8a8c93` | Input, select and textarea borders (3.36:1 on white) |
| `--sa-color-text` | `#1a1a1a` | Body text and headings |
| `--sa-color-text-subdued` | `#5e5f66` | Secondary text, hints, table headers |
| `--sa-color-text-disabled` | `#a1a1aa` | Disabled controls only (exempt from contrast) |
| `--sa-color-text-link` | `#006e95` | Text links ("Limpiar filtros") |

#### Action and brand

| Token | Value | Use |
|---|---|---|
| `--sa-color-primary` / `-hover` / `-pressed` | `#1a1a1a` / `#303030` / `#000000` | Primary button (dark, as in Shopify) |
| `--sa-color-text-on-primary` | `#ffffff` | Text on the primary button |
| `--sa-color-accent` | `#35bdf2` | Sublime cyan. Sparingly: emphasis, brand details. **Never as text on white (2.16:1).** |
| `--sa-color-accent-subdued` | `#e6f6fd` | Light cyan background |
| `--sa-color-text-on-accent` | `#0b0b0c` | Text on cyan (always dark) |
| `--sa-color-focus` | `#0a7fae` | Focus ring. A deeper shade of the brand cyan, because the cyan itself is only 2.16:1 on white. |
| `--sa-color-critical-strong` / `-hover` | `#c41230` / `#a30f28` | Destructive button |
| `--sa-color-text-on-critical` | `#ffffff` | Text on the destructive button |
| `--sa-color-inverse-surface` / `-hover` | `#1a1a1a` / `#303030` | Dark boxes: toasts |
| `--sa-color-inverse-text` | `#ffffff` | Text on dark boxes |
| `--sa-color-inverse-focus` | `#35bdf2` | Focus ring on dark boxes |
| `--sa-color-inverse-{info,success,warning,critical}-icon` | `#35bdf2`, `#4cc77a`, `#f5b923`, `#ff8a9c` | Toast icons |

#### Semantic states

Each tone has `-bg`, `-border`, `-text` and `-icon`.

| Tone | bg | border | text | icon | Use |
|---|---|---|---|---|---|
| `neutral` | `#f1f1f3` | `#dcdce0` | `#3f3f46` | `#71717a` | Draft, inactive, archived |
| `info` | `#e6f6fd` | `#9fdaf5` | `#075674` | `#0a7fae` | Informative, "Solo administradores" |
| `success` | `#e3f5e8` | `#a7dcb6` | `#0c5a2a` | `#1a8443` | Published, paid, open store |
| `warning` | `#fff4d6` | `#f1cf74` | `#6b4a00` | `#b78103` | Needs review, low stock |
| `critical` | `#fdecee` | `#f5b5be` | `#a3132b` | `#d6243e` | Errors, out of stock, cancelled |
| `attention` | `#fff1e5` | `#f8c79a` | `#8a3b00` | `#e36c00` | Pending action; "Datos todavía no disponibles" |

#### Contrast (computed)

| Foreground | Background | Ratio | Needed |
|---|---|---|---|
| text | surface / canvas / surface-subdued | 17.40 / 15.43 / 16.26 | 4.5 |
| text-subdued | surface / canvas / surface-subdued | 6.35 / 5.63 / 5.94 | 4.5 |
| text-link | surface | 5.73 | 4.5 |
| text-on-primary | primary / primary-hover | 17.40 / 13.20 | 4.5 |
| text-on-accent | accent | 9.10 | 4.5 |
| text-on-critical | critical-strong | 6.04 | 4.5 |
| neutral-text | neutral-bg | 9.26 | 4.5 |
| info-text | info-bg | 7.32 | 4.5 |
| success-text | success-bg | 7.36 | 4.5 |
| warning-text | warning-bg | 7.36 | 4.5 |
| critical-text | critical-bg / surface | 6.86 / 7.82 | 4.5 |
| attention-text | attention-bg | 7.01 | 4.5 |
| inverse-text | inverse-surface | 17.40 | 4.5 |
| focus | surface / canvas | 4.51 / 4.00 | 3 |
| border-input | surface | 3.36 | 3 |
| info / success / warning / critical icon | surface | 4.51 / 4.75 / 3.41 / 5.02 | 3 |
| inverse-focus and inverse icons | inverse-surface | 7.76 – 9.82 | 3 |
| accent (brand cyan) | surface | 2.16 | not used as text or as the ring |

### Typography

The family is the store's text face, Gontserrat, already loaded by `src/app/layout.tsx` (`--font-gontserrat`, weights 400/600/700/800). Reusing it costs no extra download and keeps the brand recognisable; the fallback is the system UI stack.

| Token | Value |
|---|---|
| `--sa-font-family` | `var(--font-gontserrat), "Montserrat", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif` |
| `--sa-font-family-mono` | `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace` |
| `--sa-font-size-xs` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl` | 12 / 13 / 14 / 16 / 20 / 24 px |
| `--sa-line-height-xs` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl` | 16 / 20 / 20 / 24 / 28 / 32 px |
| `--sa-font-weight-regular` / `-semibold` / `-bold` | 400 / 600 / 700 (only loaded weights) |

Body text is `md` (14px); labels, buttons and hints `sm` (13px); table headers and badges `xs` (12px); card titles `md` semibold; the page title `xl` bold. Inputs switch to 16px below 640px so iOS does not zoom.

### Spacing, radius and borders

| Token | Value |
|---|---|
| `--sa-space-0` … `--sa-space-16` | 0, 4 (1), 8 (2), 12 (3), 16 (4), 20 (5), 24 (6), 32 (8), 40 (10), 48 (12), 64 (16) px |
| `--sa-radius-sm` / `-md` / `-lg` / `-full` | 6 / 8 / 12 / 9999 px (controls / small boxes / cards and dialogs / pills) |
| `--sa-border-width` | 1px |

### Shadows

| Token | Use |
|---|---|
| `--sa-shadow-card` | Cards on the canvas |
| `--sa-shadow-popover` | Toasts, menus |
| `--sa-shadow-dialog` | Dialogs |
| `--sa-shadow-button` | Secondary/primary buttons |
| `--sa-focus-ring` | Box-shadow ring (2px surface gap + 2px focus colour), for elements where `outline` is clipped |

### Breakpoints

`@media` cannot read custom properties, so the tokens are for reference and the modules repeat the literal values.

| Token | Value | Use in the modules |
|---|---|---|
| `--sa-breakpoint-sm` | 640px | `max-width: 640px`: phones (larger targets, 16px inputs, stacked filters) |
| `--sa-breakpoint-md` | 900px | `min-width: 900px`: FormSection two columns, showcase grids |
| `--sa-breakpoint-lg` | 1200px | Reserved (wide layouts) |
| `--sa-breakpoint-xl` | 1440px | Reserved (wide layouts) |

### Layers and motion

| Token | Value |
|---|---|
| `--sa-z-sidebar` / `-topbar` / `-popover` / `-dialog` / `-toast` | 100 / 200 / 300 / 400 / 500 |
| `--sa-duration-fast` / `-base` / `-slow` | 100 / 200 / 300 ms; **0ms with `prefers-reduced-motion: reduce`** |
| `--sa-easing-standard` / `-exit` | `cubic-bezier(0.2, 0, 0, 1)` / `cubic-bezier(0.4, 0, 1, 1)` |

Animations (dialog and toast entry, skeleton shimmer, spinner) are also switched off under reduced motion; the spinner becomes a still ring.

## Accessibility baseline (WCAG 2.2 AA target)

- Text contrast ≥ 4.5:1 and UI contrast ≥ 3:1 (table above, enforced by tests).
- Visible focus everywhere: 2px `--sa-color-focus` outline with an offset; never removed. Inputs show it on their box (`:focus-within`).
- Target size ≥ 24×24: buttons are 28px (sm) / 32px (md), 40px on phones; links in breadcrumbs, tabs and pagination are ≥ 24px tall.
- Colour is never the only signal: badges carry text, errors carry an icon and text, row tones go with a badge.
- Semantic HTML: `<h1>` in PageHeader, `<nav>` + `<ol>` for breadcrumbs, `<caption>` and `scope` in tables, `<label for>` on every field, `role="search"` on filter forms.

## Components

### Button

`button.tsx`. Renders a `<button type="button">` or, with `href`, a Next.js `<Link>`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "tertiary" \| "critical"` | `"secondary"` | One primary per view. `critical` for destructive actions. |
| `size` | `"sm" \| "md"` | `"md"` | 28px / 32px high (40px on phones for md). |
| `loading` | `boolean` | `false` | Spinner over the label; `aria-busy` and `aria-disabled`; keeps focus; a submit button becomes `type="button"` so it cannot submit twice. |
| `icon` | `ReactNode` | — | Decorative icon before the label. |
| `iconOnly` | `true` | — | Requires `aria-label` (type-checked); no children. |
| `href` | `string` | — | Renders a link with the same look. |
| `fullWidth` | `boolean` | — | |
| …rest | native button or Link props | | `type`, `onClick`, `disabled`, `name`, `value`, `formAction`… |

```tsx
<Button variant="primary" type="submit">Guardar</Button>
<Button href="/admin/pedidos">Ver pedidos</Button>
<Button variant="critical" loading={pending}>Eliminar</Button>
<Button iconOnly aria-label="Cerrar" icon={<CloseIcon />} onClick={close} />
```

With server actions, a client wrapper can pass `loading={pending}` from `useFormStatus()`/`useActionState()`.

### Badge

`badge.tsx`. `tone`: `neutral` (default), `info`, `success`, `warning`, `critical`, `attention`; `dot` adds a decorative dot. The text always carries the meaning.

```tsx
<Badge tone="success">Publicado</Badge>
<Badge tone="warning" dot>En revisión</Badge>
```

Suggested mapping of the current states: Publicado/Pago confirmado/Tienda abierta → `success`; Borrador/Archivado/Pausada → `neutral`; En revisión/Stock bajo → `warning`; Cancelado/Agotado → `critical`; Pendiente de pago/Recibido → `attention`; Programada/Modo prueba → `info`.

### Input, Select, Textarea

`input.tsx`, `select.tsx`, `textarea.tsx`, sharing `field.tsx` (`FieldShell`, `useFieldIds`) and `field.module.css`.

| Prop | Type | Notes |
|---|---|---|
| `label` | `ReactNode` | Required. `<label for>` wired to the control. |
| `labelHidden` | `boolean` | Visually hidden label (still names the control), e.g. a search box. |
| `hint` | `ReactNode` | Help text **under** the control, linked with `aria-describedby`. Unlike the current `Field`, the hint is never a placeholder. |
| `error` | `ReactNode` | Sets `aria-invalid`, red border, icon + text, linked with `aria-describedby`. |
| `required` | `boolean` | Native `required` plus a visual `*` (aria-hidden). |
| `id` | `string` | Optional; generated with `useId` otherwise. |
| `prefix` / `suffix` (Input) | `ReactNode` | Inside the box, e.g. `"$"`, `"%"`. Decorative: put units in the label if they matter. |
| `options` / `placeholder` (Select) | `SelectOption[]` / `string` | Or pass `<option>` children. `placeholder` adds a first empty option. |
| …rest | native props | `name`, `defaultValue`, `type`, `inputMode`, `disabled`… |

```tsx
<form action={saveProduct}>
  <Input label="Precio" name="price" prefix="$" required error={state.errors?.price} />
  <Select label="Estado" name="status" defaultValue={product.status} options={STATUS_OPTIONS} />
  <Textarea label="Descripción" name="description" hint="Texto plano." />
</form>
```

They are server components and work in plain server-action forms (uncontrolled `defaultValue`).

### Dialog (client)

`dialog.tsx`. Native `<dialog>` opened with `showModal()`: the browser traps focus, makes the page inert and handles Escape.

| Prop | Type | Notes |
|---|---|---|
| `open` / `onClose` | `boolean` / `() => void` | Controlled. `onClose` runs on Escape, the close button and a backdrop click. |
| `title` | `ReactNode` | `<h2>`, names the dialog (`aria-labelledby`). |
| `description` | `ReactNode` | First paragraph, `aria-describedby`. |
| `actions` | `ReactNode` | Footer buttons; primary last. |
| `size` | `"sm" \| "md" \| "lg"` | 400 / 560 / 800px max. |
| `closeLabel` | `string` | Default "Cerrar". |
| `dismissible` | `boolean` | `false` ignores Escape and backdrop (e.g. while saving). |

Focus returns to the element that opened it. `useDialog()` returns `{ open, show, close, props }`:

```tsx
"use client";
const dialog = useDialog();
<Button variant="critical" onClick={dialog.show}>Eliminar</Button>
<Dialog {...dialog.props} size="sm" title="¿Eliminar la promoción?" description="No se puede deshacer."
  actions={<><Button onClick={dialog.close}>Cancelar</Button><Button variant="critical" onClick={remove}>Eliminar</Button></>} />
```

For a form submit that must be confirmed, use `ConfirmSubmitButton` (`confirm-submit-button.tsx`) instead of `window.confirm()`: it opens this Dialog and, on confirm, submits its form with a hidden submitter that keeps `name`, `value` and `formAction`. The old `ConfirmButton` (`src/components/admin/confirm-button.tsx`) remains in modules not yet redesigned.

```tsx
<form action={removeImageAction}>
  <input type="hidden" name="imageId" value={image.id} />
  <ConfirmSubmitButton title="¿Quitar la imagen?" description="Se quita del producto. Podés volver a subirla." confirmLabel="Quitar">
    Quitar
  </ConfirmSubmitButton>
</form>
```

### Toast (client)

`toast.tsx` + `toast-queue.ts`. `ToastProvider` holds the queue and renders an always-present `aria-live="polite"` list inside a region named "Notificaciones". `useToast()` returns `{ show(message, { tone, duration }), dismiss(id) }`.

- Tones: `info` (default), `success`, `warning`, `critical`; the tone shows in the icon.
- Auto-dismiss after 5 s, paused while the toast is hovered or has focus; `critical` toasts stay until closed (WCAG 2.2.1). `duration: null` keeps any toast.
- At most 3 on screen; the oldest leaves first. Each has a "Cerrar notificación" button.
- Entry animation is removed under reduced motion.

```tsx
const toast = useToast();
toast.show("Producto guardado", { tone: "success" });
```

### DataTable

`data-table.tsx`. Server-renderable; cell renderers are functions, so render it from a server component (or from a client one).

| Prop | Type | Notes |
|---|---|---|
| `columns` | `DataTableColumn<Row>[]` | `{ key, header, cell(row, i), align?, width?, nowrap?, headerHidden?, rowHeader? }` |
| `rows` / `rowKey` | `Row[]` / `(row) => string` | |
| `caption` / `captionHidden` | `ReactNode` / `boolean` | Names the table and its scroll region. |
| `rowHref` | `(row) => string \| undefined` | The row-header cell becomes a link stretched over the row; checkboxes, buttons and links in other cells stay clickable above it. |
| `rowTone` | `(row) => "critical" \| "warning" \| "subdued"` | Row highlight; pair it with a Badge. Replaces the triple meaning of `tr.is-low`. |
| `stickyHeader` / `maxHeight` | `boolean` / `string` | Header stays visible while the table scrolls inside its box (default `70vh`). |
| `empty` | `ReactNode` | Shown when `rows` is empty (an `EmptyState`); default "No hay registros para mostrar." |
| `loading` / `loadingRows` / `loadingLabel` | | Skeleton rows, `aria-busy`, and a status message. |

The row-header column (`rowHeader: true`, otherwise the first column) renders `<th scope="row">`. The wrapper is a focusable `role="region"` so keyboard users can scroll wide tables.

**Composition with the existing selection** (`SelectableTable`, `SelectAllCheckbox`, `RowCheckbox`, `SelectionBar` stay as they are):

```tsx
const SELECT: DataTableColumn<Order> = {
  key: "select",
  header: <SelectAllCheckbox />,
  cell: (order) => <RowCheckbox id={order.id} label={order.code} />,
  width: "48px",
};

<SelectableTable ids={orders.map((order) => order.id)}>
  <SelectionBar><ExportSelectedButton endpoint="/admin/pedidos/exportar" /></SelectionBar>
  <DataTable caption="Pedidos" captionHidden columns={[SELECT, ...COLUMNS]} rows={orders}
    rowKey={(order) => order.id} rowHref={(order) => `/admin/pedidos/${order.id}`} />
</SelectableTable>
```

The table stays a server component; only the checkboxes and the bar are client components (they read the selection context). Set `rowHeader: true` on the column that names the row so the checkbox column is not used as the link.

### FilterBar and LinkTabs

`filter-bar.tsx`: a `<form method="get" role="search">` for a list. Works without JavaScript and keeps filters in the URL.

| Prop | Notes |
|---|---|
| `action` | The list URL. |
| `search` | `{ name = "q", label = "Buscar", placeholder, defaultValue }`; label visually hidden, search icon prefix. |
| `filters` | Filter controls, typically `<Select labelHidden defaultValue={…}>`. |
| `hiddenFields` | Values to keep on submit (e.g. the active tab). |
| `clearHref` | Shows "Limpiar filtros". |
| `submitLabel` | Default "Aplicar". |
| `tabs` | A `<LinkTabs>` row above the form. |

`link-tabs.tsx`: `<LinkTabs label="Filtrar por estado" tabs={[{ label, href, current, count }]} />`. Links with `aria-current="page"` (not an ARIA tab widget, same as the current `.admin-tabs`); tabs with `count: 0` are dimmed.

To apply filters on change, wrap the same fields in the existing `AutoSubmitForm` instead of the FilterBar's own form, or keep the "Aplicar" button.

### Pagination

`pagination.tsx` + `pagination-links.ts`. `<nav aria-label="Paginación">` with "Anterior", "Página N de M · desde–hasta de total" and "Siguiente".

| Prop | Notes |
|---|---|
| `page`, `pageSize` | Out-of-range pages are clamped. |
| `total` or `hasNext` | With a total it shows "51–100 de 120"; without it, `hasNext` decides the next link. |
| `baseHref`, `searchParams`, `param = "pagina"` | Links keep the other filters; page 1 has no parameter (like the product list). |
| `previousHref`, `nextHref` | For cursor lists such as Actividad (`?antes=`). |

At the ends the link becomes a non-focusable `aria-disabled` label. `pageHref()` and `paginationState()` are exported for custom layouts.

### EmptyState

`empty-state.tsx`. `heading` (h2 by default, `headingLevel`), description as children, optional `icon` and `action`, `appearance` `"plain"` (inside a card or table) or `"card"`.

`variant="unavailable"` is for **data that does not exist yet** (a metric the panel does not compute): it shows the attention badge "Datos todavía no disponibles" and a dashed border, so nobody reads it as a real zero. Use it instead of showing invented numbers.

```tsx
<EmptyState variant="unavailable" appearance="card" heading="Ventas de los últimos 30 días">
  <p>El panel todavía no calcula esta métrica.</p>
</EmptyState>
```

### Skeleton

`skeleton.tsx`. `Skeleton` is the container: `role="status"` with a visually hidden `label` (default "Cargando…"); its shapes are `aria-hidden`. Shapes: `SkeletonText lines`, `SkeletonBlock height`, `SkeletonTableRows rows columns` (used by `DataTable loading`). Good as a `Suspense` fallback.

### FormSection

`form-section.tsx`. Shopify settings layout: title and description on the left, the fields in a card on the right (two columns from 900px; stacked below). It renders a `<section aria-labelledby>`, never a `<form>`, so several sections can share one server-action form. `footer` adds a card footer (e.g. the save button).

### PageHeader and Breadcrumbs

`page-header.tsx`: the page `<h1>` with `subtitle`, `breadcrumbs` slot, `back={{ href, label }}` (icon-only link named by `label`, e.g. "Volver a Productos"), `meta` (badges beside the title), `secondaryActions` and `primaryAction` (primary last, on the right).

`breadcrumbs.tsx`: `<nav aria-label="Migas de pan"><ol>`; the last item is the current page (`aria-current="page"`, not a link). Chevron separators are `aria-hidden`.

```tsx
<PageHeader
  breadcrumbs={<Breadcrumbs items={[{ label: "Pedidos", href: "/admin/pedidos" }, { label: order.code }]} />}
  back={{ href: "/admin/pedidos", label: "Volver a Pedidos" }}
  title={order.code}
  meta={<Badge tone="success">Pago confirmado</Badge>}
  primaryAction={<Button variant="primary">Marcar enviado</Button>}
/>
```

### Card, Stack, Inline, VisuallyHidden

- `Card`: white surface with `title` (`headingLevel`), `actions`, `footer`, `padding="none"` for edge-to-edge tables, `section` to render a named `<section>` (needs `id`).
- `Stack` (vertical) and `Inline` (wrapping row) take `gap` as a spacing step (`--sa-space-N`) and alignment.
- `VisuallyHidden`: text for screen readers only.

### Helpers

| File | Export | Purpose |
|---|---|---|
| `class-names.ts` | `cx()` | Joins class names, skipping falsy values. |
| `contrast.ts` | `contrastRatio()`, `relativeLuminance()`, `parseCustomProperties()` | WCAG contrast; reads the tokens for the tests. |
| `pagination-links.ts` | `pageHref()`, `paginationState()` | Pagination links and range. |
| `toast-queue.ts` | `toastReducer()`, `toastDuration()`, `MAX_TOASTS` | Toast queue and timing. |

These are plain `.ts` files with relative imports so `node --test` can run them.
