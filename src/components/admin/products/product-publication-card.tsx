"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setProductStatusAction } from "@/app/admin/actions";
import { Badge, Button, Card, ConfirmSubmitButton } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import type { ProductStatus } from "@/server/admin/validation";
import { useSaveToast } from "./product-form-parts";
import { STATUS_BADGE, statusActions, statusDescription } from "./product-page-helpers";
import styles from "./product-page.module.css";

/** One status button, busy while its own change is being saved. */
function StatusButton({ status, label, primary }: { status: ProductStatus; label: string; primary: boolean }) {
  const { pending, data } = useFormStatus();
  return (
    <Button type="submit" name="status" value={status} size="sm" variant={primary ? "primary" : "secondary"} loading={pending && data?.get("status") === status}>
      {label}
    </Button>
  );
}

/**
 * Side-column card: the current status and the changes allowed from it
 * (setProductStatusAction, same rules and audit entry as saving the form).
 * Archiving asks first. The result stays next to the buttons.
 */
export function ProductPublicationCard({ productId, status }: { productId: string; status: ProductStatus }) {
  const [state, action] = useActionState<AdminFormState, FormData>(setProductStatusAction, {});
  useSaveToast(state);

  const badge = STATUS_BADGE[status];
  return (
    <Card section id="publicacion" title="Publicación">
      <div className={styles.statusRow}>
        <Badge tone={badge.tone} dot>
          {badge.label}
        </Badge>
      </div>
      <p className={styles.muted}>{statusDescription(status)}</p>
      <form action={action} className={styles.actionsRow}>
        <input type="hidden" name="productId" value={productId} />
        {statusActions(status).map((option, index) =>
          option.confirm ? (
            <ConfirmSubmitButton
              key={option.status}
              name="status"
              value={option.status}
              variant="secondary"
              title="¿Archivar el producto?"
              description="Deja de verse en la tienda. Queda en el panel con su historial y podés volver a publicarlo."
              confirmLabel="Archivar"
            >
              {option.label}
            </ConfirmSubmitButton>
          ) : (
            <StatusButton key={option.status} status={option.status} label={option.label} primary={index === 0 && option.status === "active"} />
          ),
        )}
      </form>
      {state.error && (
        <p className={styles.inlineError} role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        // The toast announces it; the text stays next to the buttons.
        <p className={styles.saved}>{state.ok}</p>
      )}
    </Card>
  );
}
