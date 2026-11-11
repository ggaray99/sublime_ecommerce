"use client";

import { useActionState } from "react";
import { updateImageAltAction, uploadProductImageAction } from "@/app/admin/actions";
import { uploadCategoryImageAction } from "@/app/admin/categorias/actions";
import { Field, FileField, Status } from "./forms";

export function ProductImageUpload({ productId, productName }: { productId: string; productName: string }) {
  const [state, action, pending] = useActionState(uploadProductImageAction, {});
  return (
    <form action={action} className="quote-form">
      <Status state={state} />
      <input type="hidden" name="productId" value={productId} />
      <div className="form-grid">
        <FileField state={state} />
        <Field
          name="alt"
          label="Texto alternativo"
          state={state}
          defaultValue={state.values?.alt ?? productName}
          hint="Qué muestra la foto (para lectores de pantalla)"
          required
        />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Subiendo…" : "Subir imagen"}
      </button>
    </form>
  );
}

export function ImageAltForm({ productId, imageId, alt }: { productId: string; imageId: string; alt: string }) {
  const [state, action, pending] = useActionState(updateImageAltAction, {});
  return (
    <form action={action} className="image-alt-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="imageId" value={imageId} />
      <Field name="alt" label="Texto alternativo" state={state} defaultValue={state.values?.alt ?? alt} />
      <button type="submit" className="link-button" disabled={pending}>
        {pending ? "Guardando…" : "Guardar texto"}
      </button>
      {state.ok && (
        <span className="muted" role="status">
          {state.ok}
        </span>
      )}
      {state.error && (
        <span className="field__error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function CategoryImageUpload({ categoryId, hasImage }: { categoryId: string; hasImage: boolean }) {
  const [state, action, pending] = useActionState(uploadCategoryImageAction, {});
  return (
    <form action={action} className="quote-form">
      <Status state={state} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <FileField state={state} />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Subiendo…" : hasImage ? "Reemplazar imagen" : "Subir imagen"}
      </button>
    </form>
  );
}
