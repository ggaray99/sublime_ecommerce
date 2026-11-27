"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeProductsAction } from "@/app/admin/productos/bulk-actions";
import { useSelection } from "@/components/admin/selectable-table";
import { Button, Dialog, useDialog, useToast } from "@/components/admin/ui";
import type { BulkProductAction } from "@/server/admin/product-search";

type ActionCopy = {
  label: string;
  /** Dialog title for n products. */
  title: (count: number) => string;
  /** Dialog text for n products (singular and plural differ). */
  description: (count: number) => string;
  confirm: string;
};

const products = (count: number) => `${count} ${count === 1 ? "producto" : "productos"}`;

const ACTIONS: Record<BulkProductAction, ActionCopy> = {
  publish: {
    label: "Publicar",
    title: (count) => `¿Publicar ${products(count)}?`,
    description: (count) =>
      count === 1
        ? "Se va a ver en la tienda. Pasa por las mismas reglas que al guardarlo desde su ficha: si no las cumple (por ejemplo, sin precio) queda como está y te contamos por qué."
        : "Se van a ver en la tienda. Cada producto pasa por las mismas reglas que al guardarlo desde su ficha: los que no las cumplan (por ejemplo, sin precio) quedan como están y te contamos por qué.",
    confirm: "Publicar",
  },
  draft: {
    label: "Pasar a borrador",
    title: (count) => `¿Pasar ${products(count)} a borrador?`,
    description: (count) =>
      count === 1 ? "Deja de verse en la tienda. Podés volver a publicarlo cuando quieras." : "Dejan de verse en la tienda. Podés volver a publicarlos cuando quieras.",
    confirm: "Pasar a borrador",
  },
  archive: {
    label: "Archivar",
    title: (count) => `¿Archivar ${products(count)}?`,
    description: (count) =>
      count === 1
        ? "Deja de verse en la tienda y queda en la pestaña Archivados. Podés volver a publicarlo cuando quieras."
        : "Dejan de verse en la tienda y quedan en la pestaña Archivados. Podés volver a publicarlos cuando quieras.",
    confirm: "Archivar",
  },
  feature: {
    label: "Destacar",
    title: (count) => `¿Destacar ${products(count)}?`,
    description: (count) => (count === 1 ? "Se marca como destacado." : "Se marcan como destacados."),
    confirm: "Destacar",
  },
  unfeature: {
    label: "Quitar destacado",
    title: (count) => `¿Quitar el destacado de ${products(count)}?`,
    description: (count) => (count === 1 ? "Deja de estar marcado como destacado." : "Dejan de estar marcados como destacados."),
    confirm: "Quitar destacado",
  },
};

const ORDER: BulkProductAction[] = ["publish", "draft", "archive", "feature", "unfeature"];

/**
 * Status and featured changes on the checked products, inside <SelectionBar>.
 * Each opens a confirmation naming how many products; the result (including
 * the products that could not change, with the reason) shows in a toast.
 */
export function BulkProductActions() {
  const { selected, clear } = useSelection();
  const dialog = useDialog();
  const toast = useToast();
  const router = useRouter();
  const [action, setAction] = useState<BulkProductAction>("publish");
  const [pending, startTransition] = useTransition();
  const copy = ACTIONS[action];
  const count = selected.length;

  function ask(next: BulkProductAction) {
    setAction(next);
    dialog.show();
  }

  function apply() {
    const ids = selected;
    startTransition(async () => {
      try {
        const result = await changeProductsAction({ action, ids });
        toast.show(result.message, { tone: result.tone });
        dialog.close();
        if (result.changed) router.refresh();
        // After the dialog's close event has returned focus: clearing removes the bar
        // and moves focus to "Seleccionar todos".
        setTimeout(clear, 0);
      } catch {
        toast.show("No pudimos aplicar el cambio. Revisá la conexión y probá de nuevo.", { tone: "critical" });
      }
    });
  }

  return (
    <>
      {ORDER.map((item) => (
        <Button key={item} size="sm" onClick={() => ask(item)}>
          {ACTIONS[item].label}
        </Button>
      ))}
      <Dialog
        {...dialog.props}
        size="sm"
        dismissible={!pending}
        title={copy.title(count)}
        description={copy.description(count)}
        actions={
          <>
            <Button onClick={dialog.close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending} onClick={apply}>
              {copy.confirm}
            </Button>
          </>
        }
      />
    </>
  );
}
