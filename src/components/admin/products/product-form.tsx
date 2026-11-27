"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { createProductAction, updateProductAction } from "@/app/admin/actions";
import { Button, Card, Input, Select, Textarea, type SelectOption } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import { ErrorSummary, fieldId, ProductCheckbox, SavedMessage, useSaveToast } from "./product-form-parts";
import styles from "./product-page.module.css";

/** Current values of a product, as the form fields expect them. */
export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  theme: string;
  tags: string;
  details: string;
  featured: boolean;
  catalogCode: string;
  price: string;
  status: string;
};

/** Labels in form order, for the error summary. */
const DATA_LABELS: Record<string, string> = {
  name: "Nombre",
  slug: "URL (slug)",
  price: "Precio",
  description: "Descripción",
  details: "Material y uso",
  status: "Estado",
  categoryId: "Categoría",
  theme: "Temática",
  tags: "Etiquetas",
  catalogCode: "Código de catálogo",
};

const CREATE_LABELS: Record<string, string> = {
  ...DATA_LABELS,
  sku: "SKU",
  initialStock: "Stock inicial",
  file: "Foto principal",
  alt: "Texto alternativo",
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Borrador (no se ve en la tienda)" },
  { value: "active", label: "Publicado" },
  { value: "archived", label: "Archivado (baja)" },
];

const ACCEPT = "image/jpeg,image/png,image/webp";
const FILE_HINT = "JPG, PNG o WebP, hasta 4 MB, entre 400 y 4000 px por lado.";

type FieldsProps = {
  state: AdminFormState;
  value: (key: keyof ProductFormValues) => string;
  idPrefix: string;
  /** Id of the <form> the fields belong to, when they render outside it. */
  form?: string;
};

/** Name, URL, price, description and material: the "Datos del producto" card. */
function ContentFields({
  state,
  value,
  idPrefix,
  form,
  mode,
  requiresQuote,
  hasOptions,
}: FieldsProps & { mode: "create" | "edit"; requiresQuote: boolean; hasOptions: boolean }) {
  const error = (key: string) => state.fields?.[key];
  const id = (key: string) => fieldId(idPrefix, key);
  return (
    <>
      <Input id={id("name")} form={form} name="name" label="Nombre" required defaultValue={value("name")} error={error("name")} />
      <div className={styles.grid2}>
        <Input
          id={id("slug")}
          form={form}
          name="slug"
          label="URL (slug)"
          defaultValue={value("slug")}
          error={error("slug")}
          hint={mode === "create" ? "Vacío = se genera desde el nombre." : "Cambiarla rompe los enlaces ya compartidos."}
        />
        {requiresQuote ? (
          <p className={styles.muted}>Producto a pedido: se cotiza en cada encargo, no lleva precio fijo.</p>
        ) : hasOptions ? (
          <>
            <input type="hidden" form={form} name="price" value={value("price")} />
            <p className={styles.muted}>Tiene variantes: el precio de cada una se edita en la sección Variantes.</p>
          </>
        ) : (
          <Input
            id={id("price")}
            form={form}
            name="price"
            label="Precio (ARS)"
            prefix="$"
            inputMode="decimal"
            defaultValue={value("price")}
            error={error("price")}
            hint={mode === "create" ? "En pesos (2500 o 2.500,50). Vacío si es a pedido." : "En pesos, por ejemplo 2500 o 2.500,50."}
          />
        )}
      </div>
      <Textarea id={id("description")} form={form} name="description" label="Descripción" defaultValue={value("description")} error={error("description")} />
      <Textarea
        id={id("details")}
        form={form}
        name="details"
        label="Material y uso"
        hint="Una línea por dato."
        defaultValue={value("details")}
        error={error("details")}
      />
    </>
  );
}

/** Category, theme, tags, catalog code and featured: the "Organización" card. */
function OrganizationFields({
  state,
  value,
  idPrefix,
  form,
  categories,
  themes,
  featured,
}: FieldsProps & { categories: SelectOption[]; themes: SelectOption[]; featured: boolean }) {
  const error = (key: string) => state.fields?.[key];
  const id = (key: string) => fieldId(idPrefix, key);
  return (
    <>
      <Select
        id={id("categoryId")}
        form={form}
        name="categoryId"
        label="Categoría"
        required
        options={categories}
        defaultValue={value("categoryId")}
        error={error("categoryId")}
      />
      <Select id={id("theme")} form={form} name="theme" label="Temática" required options={themes} defaultValue={value("theme")} error={error("theme")} />
      <Input id={id("tags")} form={form} name="tags" label="Etiquetas" hint="Separadas por coma. Se usan en la búsqueda." defaultValue={value("tags")} error={error("tags")} />
      <Input
        id={id("catalogCode")}
        form={form}
        name="catalogCode"
        label="Código de catálogo"
        hint="Opcional, 3 a 6 dígitos."
        inputMode="numeric"
        defaultValue={value("catalogCode")}
        error={error("catalogCode")}
      />
      <ProductCheckbox id={id("featured")} form={form} name="featured" label="Destacado" hint="Aparece primero y en el inicio." defaultChecked={featured} />
    </>
  );
}

const valuesOf = (state: AdminFormState, initial: ProductFormValues) => ({
  value: (key: keyof ProductFormValues) => state.values?.[key] ?? String(initial[key]),
  featured: state.values ? state.values.featured === "on" : initial.featured,
});

// ---------------------------------------------------------------- Edit

const DATA_FORM_ID = "product-data-form";
const EDIT_PREFIX = "product";

type DataContext = { state: AdminFormState; pending: boolean; initial: ProductFormValues };
const ProductDataContext = createContext<DataContext | null>(null);

function useProductData(): DataContext {
  const context = useContext(ProductDataContext);
  if (!context) throw new Error("Product data cards need a <ProductDataForm>.");
  return context;
}

/**
 * The updateProductAction form, shared by the "Datos del producto" and
 * "Organización" cards (main and side columns). The <form> holds only the
 * hidden fields; every control joins it with the `form` attribute, so one
 * save sends the same fields as before. The status is sent as it is now: the
 * publication card changes it with its own action.
 */
export function ProductDataForm({
  productId,
  status,
  initial,
  children,
}: {
  productId: string;
  status: string;
  initial: ProductFormValues;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(updateProductAction, {});
  useSaveToast(state);
  return (
    <ProductDataContext.Provider value={{ state, pending, initial }}>
      <form id={DATA_FORM_ID} action={action} noValidate>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="status" value={status} />
      </form>
      {children}
    </ProductDataContext.Provider>
  );
}

function SaveDataButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" form={DATA_FORM_ID} variant="primary" loading={pending}>
      Guardar datos
    </Button>
  );
}

export function ProductDataCard({ requiresQuote, hasOptions }: { requiresQuote: boolean; hasOptions: boolean }) {
  const { state, pending, initial } = useProductData();
  const { value } = valuesOf(state, initial);
  return (
    <Card
      section
      id="datos"
      title="Datos del producto"
      footer={
        <div className={styles.saveRow}>
          <SavedMessage state={state} />
          <SaveDataButton pending={pending} />
        </div>
      }
    >
      <ErrorSummary state={state} labels={DATA_LABELS} idPrefix={EDIT_PREFIX} />
      <ContentFields
        state={state}
        value={value}
        idPrefix={EDIT_PREFIX}
        form={DATA_FORM_ID}
        mode="edit"
        requiresQuote={requiresQuote}
        hasOptions={hasOptions}
      />
      <p className={styles.muted}>«Guardar datos» guarda esta sección y Organización.</p>
    </Card>
  );
}

export function ProductOrganizationCard({ categories, themes }: { categories: SelectOption[]; themes: SelectOption[] }) {
  const { state, pending, initial } = useProductData();
  const { value, featured } = valuesOf(state, initial);
  return (
    <Card
      section
      id="organizacion"
      title="Organización"
      footer={
        <div className={styles.saveRow}>
          <SaveDataButton pending={pending} />
        </div>
      }
    >
      <OrganizationFields
        state={state}
        value={value}
        idPrefix={EDIT_PREFIX}
        form={DATA_FORM_ID}
        categories={categories}
        themes={themes}
        featured={featured}
      />
      <p className={styles.muted}>Se guarda junto con Datos del producto.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- Create

const CREATE_PREFIX = "new-product";

/** createProductAction: the same fields as before, grouped in cards over two columns. */
export function NewProductForm({
  initial,
  categories,
  themes,
  uploadsEnabled,
}: {
  initial: ProductFormValues;
  categories: SelectOption[];
  themes: SelectOption[];
  uploadsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(createProductAction, {});
  const { value, featured } = valuesOf(state, initial);
  const id = (key: string) => fieldId(CREATE_PREFIX, key);
  const error = (key: string) => state.fields?.[key];

  return (
    <form action={action} noValidate className={styles.layout}>
      <div className={styles.main}>
        <Card section id="nuevo-datos" title="Datos del producto">
          <ErrorSummary state={state} labels={CREATE_LABELS} idPrefix={CREATE_PREFIX} />
          <ContentFields state={state} value={value} idPrefix={CREATE_PREFIX} mode="create" requiresQuote={false} hasOptions={false} />
        </Card>

        <Card section id="nuevo-alta" title="Alta">
          <ProductCheckbox
            id={id("requiresQuote")}
            name="requiresQuote"
            label="Producto a pedido"
            hint="Se cotiza en cada encargo: sin precio ni stock."
            defaultChecked={state.values?.requiresQuote === "on"}
          />
          <div className={styles.grid2}>
            <Input id={id("sku")} name="sku" label="SKU" hint="Vacío = se genera automáticamente." defaultValue={state.values?.sku ?? ""} error={error("sku")} />
            <Input
              id={id("initialStock")}
              name="initialStock"
              label="Stock inicial"
              hint="Unidades contadas (conteo inicial)."
              inputMode="numeric"
              defaultValue={state.values?.initialStock ?? "0"}
              error={error("initialStock")}
            />
          </div>
        </Card>

        <Card section id="nuevo-foto" title="Foto principal (opcional)">
          {uploadsEnabled ? (
            <div className={styles.grid2}>
              <Input id={id("file")} name="file" type="file" accept={ACCEPT} label="Archivo" hint={FILE_HINT} error={error("file")} />
              <Input
                id={id("alt")}
                name="alt"
                label="Texto alternativo"
                hint="Qué muestra la foto. Vacío = el nombre."
                defaultValue={state.values?.alt ?? ""}
                error={error("alt")}
              />
            </div>
          ) : (
            <p className={styles.muted}>La carga de imágenes no está configurada en este entorno.</p>
          )}
          <p className={styles.muted}>Después de crearlo podés sumar más fotos y elegir la portada. Sin fotos, la tienda muestra la imagen de la categoría.</p>
        </Card>
      </div>

      <div className={styles.side}>
        <Card section id="nuevo-publicacion" title="Publicación">
          <Select
            id={id("status")}
            name="status"
            label="Estado"
            options={STATUS_OPTIONS}
            defaultValue={value("status")}
            error={error("status")}
            hint="Se crea en borrador salvo que elijas otro estado."
          />
        </Card>
        <Card section id="nuevo-organizacion" title="Organización">
          <OrganizationFields state={state} value={value} idPrefix={CREATE_PREFIX} categories={categories} themes={themes} featured={featured} />
        </Card>
        <div className={styles.saveRow}>
          <Button href="/admin/productos" variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Crear producto
          </Button>
        </div>
      </div>
    </form>
  );
}
