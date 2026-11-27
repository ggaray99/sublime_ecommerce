"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { fulfillOrdersAction } from "@/app/admin/pedidos/bulk-actions";
import { useSelection } from "@/components/admin/selectable-table";
import { Button, Dialog, useDialog, useToast } from "@/components/admin/ui";

const orders = (count: number) => `${count} ${count === 1 ? "pedido" : "pedidos"}`;

/**
 * "Marcar entregado" on the checked orders, inside <SelectionBar>. The only
 * bulk change offered (docs/admin-orders-audit.md, O12): it confirms how many
 * orders, and the result (with the orders that could not change and why)
 * shows in a toast.
 */
export function BulkOrderActions() {
  const { selected, clear } = useSelection();
  const dialog = useDialog();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const count = selected.length;

  function apply() {
    const ids = selected;
    startTransition(async () => {
      try {
        const result = await fulfillOrdersAction({ ids });
        toast.show(result.message, { tone: result.tone });
        dialog.close();
        if (result.changed) router.refresh();
        // After the dialog's close event has returned focus: clearing moves focus to "Seleccionar todos".
        setTimeout(clear, 0);
      } catch {
        toast.show("No pudimos aplicar el cambio. Revisá la conexión y probá de nuevo.", { tone: "critical" });
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => dialog.show()}>
        Marcar entregado
      </Button>
      <Dialog
        {...dialog.props}
        size="sm"
        dismissible={!pending}
        title={count === 1 ? "¿Marcar 1 pedido como entregado?" : `¿Marcar ${orders(count)} como entregados?`}
        description={
          count === 1
            ? "Solo se entrega si ya fue enviado, o si está pagado y es para retirar. Si no corresponde, queda como está y te contamos por qué."
            : "Solo se entregan los pedidos ya enviados, o pagados para retirar. Los demás quedan como están y te contamos por qué."
        }
        actions={
          <>
            <Button onClick={dialog.close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending} onClick={apply}>
              Marcar entregado
            </Button>
          </>
        }
      />
    </>
  );
}
