"use client";

import { useFormStatus } from "react-dom";
import { duplicateProductAction } from "@/app/admin/actions";
import { Button } from "@/components/admin/ui";

function DuplicateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Duplicar
    </Button>
  );
}

/** Copies the product as a draft and opens the copy (duplicateProductAction). */
export function ProductDuplicateButton({ productId }: { productId: string }) {
  return (
    <form action={duplicateProductAction}>
      <input type="hidden" name="productId" value={productId} />
      <DuplicateSubmit />
    </form>
  );
}
