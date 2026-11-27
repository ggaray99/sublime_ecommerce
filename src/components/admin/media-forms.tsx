"use client";

import { useActionState } from "react";
import { uploadCategoryImageAction } from "@/app/admin/categorias/actions";
import { FileField, Status } from "./forms";

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
