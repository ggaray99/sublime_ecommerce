"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { moveImageAction, removeImageAction, updateImageAltAction, uploadProductImageAction } from "@/app/admin/actions";
import { Button, ConfirmSubmitButton, Input } from "@/components/admin/ui";
import { ErrorSummary, fieldId, SavedMessage, useSaveToast } from "./product-form-parts";
import styles from "./product-page.module.css";

type IconProps = { size?: number };
const svg = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});
const ArrowUpLeftIcon = ({ size }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ArrowDownRightIcon = ({ size }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);
const StarIcon = ({ size }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);

const MOVE_ICONS = { first: <StarIcon />, up: <ArrowUpLeftIcon />, down: <ArrowDownRightIcon /> } as const;

/** Icon button of one move form, busy while that move is being saved. */
function MoveButton({ move, label }: { move: "first" | "up" | "down"; label: string }) {
  const { pending, data } = useFormStatus();
  return (
    <Button
      type="submit"
      name="move"
      value={move}
      size="sm"
      variant="tertiary"
      iconOnly
      aria-label={label}
      title={label}
      icon={MOVE_ICONS[move]}
      loading={pending && data?.get("move") === move}
    />
  );
}

/** Order buttons and "Quitar" of one photo (same actions as before). */
export function ImageTools({
  productId,
  imageId,
  position,
  isFirst,
  isLast,
}: {
  productId: string;
  imageId: string;
  /** 1-based, for the accessible names. */
  position: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hidden = (
    <>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="imageId" value={imageId} />
    </>
  );
  return (
    <div className={styles.imageTools}>
      <form action={moveImageAction}>
        {hidden}
        {!isFirst && <MoveButton move="up" label={`Mover antes (imagen ${position})`} />}
        {!isLast && <MoveButton move="down" label={`Mover después (imagen ${position})`} />}
        {!isFirst && <MoveButton move="first" label={`Usar como portada (imagen ${position})`} />}
      </form>
      <form action={removeImageAction} className={styles.push}>
        {hidden}
        <ConfirmSubmitButton
          title="¿Quitar la imagen?"
          description="Se quita del producto. Si se subió desde el panel, el archivo se elimina; podés volver a subirla."
          confirmLabel="Quitar"
        >
          Quitar
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

/** Alt text of one photo, saved on its own. */
export function ImageAltForm({ productId, imageId, alt, position }: { productId: string; imageId: string; alt: string; position: number }) {
  const [state, action, pending] = useActionState(updateImageAltAction, {});
  useSaveToast(state);
  const prefix = `image-${imageId}`;
  return (
    <form action={action} noValidate className={styles.grid2Stack}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="imageId" value={imageId} />
      <Input
        id={fieldId(prefix, "alt")}
        name="alt"
        label={`Texto alternativo (imagen ${position})`}
        defaultValue={state.values?.alt ?? alt}
        error={state.fields?.alt ?? state.error}
      />
      <div className={styles.saveRow}>
        <SavedMessage state={state} />
        <Button type="submit" size="sm" loading={pending}>
          Guardar texto
        </Button>
      </div>
    </form>
  );
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const FILE_HINT = "JPG, PNG o WebP, hasta 4 MB, entre 400 y 4000 px por lado.";
const UPLOAD_LABELS = { file: "Archivo", alt: "Texto alternativo" };

/** New photo: same action and validation as before. */
export function ImageUploadForm({ productId, productName }: { productId: string; productName: string }) {
  const [state, action, pending] = useActionState(uploadProductImageAction, {});
  useSaveToast(state);
  const prefix = "image-upload";
  return (
    <form action={action} noValidate className={styles.grid2Stack}>
      <ErrorSummary state={state} labels={UPLOAD_LABELS} idPrefix={prefix} />
      <input type="hidden" name="productId" value={productId} />
      <div className={styles.grid2}>
        <Input id={fieldId(prefix, "file")} name="file" type="file" accept={ACCEPT} label="Archivo" hint={FILE_HINT} error={state.fields?.file} />
        <Input
          id={fieldId(prefix, "alt")}
          name="alt"
          label="Texto alternativo"
          required
          hint="Qué muestra la foto (para lectores de pantalla)."
          defaultValue={state.values?.alt ?? productName}
          error={state.fields?.alt}
        />
      </div>
      <div className={styles.saveRow}>
        <SavedMessage state={state} />
        <Button type="submit" loading={pending}>
          Subir imagen
        </Button>
      </div>
    </form>
  );
}
