"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { Dialog, useDialog } from "./dialog";

export type ConfirmSubmitButtonProps = {
  /** Button text, also used as the confirm button's label unless `confirmLabel` is given. */
  children: ReactNode;
  /** Dialog title, phrased as the question ("¿Quitar la imagen?"). */
  title: ReactNode;
  /** What happens, and whether it can be undone. */
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: string;
  variant?: ButtonVariant;
  /** Variant of the confirm button in the dialog; destructive actions use "critical" (default). */
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  /** Sent with the form, like a regular submit button's name/value. */
  name?: string;
  value?: string;
  /** Server action for this button only (a form with several actions). */
  formAction?: (formData: FormData) => void | Promise<void>;
  className?: string;
};

/**
 * Submit button that asks in a Dialog before submitting its form (replaces
 * window.confirm). Must be inside a <form>; the form is submitted with this
 * button as the submitter, so name/value and formAction still apply. Shows a
 * loading state while the form is pending.
 */
export function ConfirmSubmitButton({
  children,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "tertiary",
  confirmVariant = "critical",
  size = "sm",
  name,
  value,
  formAction,
  className,
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const dialog = useDialog();
  const submitter = useRef<HTMLButtonElement>(null);

  function confirm() {
    dialog.close();
    const button = submitter.current;
    button?.form?.requestSubmit(button);
  }

  return (
    <>
      {/* The real submitter stays hidden; the visible button only opens the dialog. */}
      <button ref={submitter} type="submit" name={name} value={value} formAction={formAction} hidden tabIndex={-1} aria-hidden="true" />
      <Button type="button" variant={variant} size={size} loading={pending} onClick={dialog.show} className={className}>
        {children}
      </Button>
      <Dialog
        {...dialog.props}
        size="sm"
        title={title}
        description={description}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={dialog.close}>
              {cancelLabel}
            </Button>
            <Button type="button" variant={confirmVariant} onClick={confirm}>
              {confirmLabel ?? children}
            </Button>
          </>
        }
      />
    </>
  );
}
