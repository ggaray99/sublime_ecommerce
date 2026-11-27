"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { cx } from "./class-names.ts";
import { Button } from "./button";
import { CloseIcon } from "./icons";
import styles from "./dialog.module.css";

export type DialogSize = "sm" | "md" | "lg";

export type DialogProps = {
  /** Controlled: the dialog shows while `open` is true. */
  open: boolean;
  /** Called when the person asks to close: Escape, the close button or the backdrop. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Footer buttons; the primary action goes last. */
  actions?: ReactNode;
  children?: ReactNode;
  size?: DialogSize;
  /** Accessible name of the close button. */
  closeLabel?: string;
  /** false: Escape and the backdrop do not close it (e.g. while saving). */
  dismissible?: boolean;
};

/**
 * Modal built on the native <dialog> (showModal): the browser traps focus,
 * makes the page inert and handles Escape. Focus goes back to the element
 * that opened it. Render it inside the `.theme` wrapper so it gets the tokens.
 */
export function Dialog({ open, onClose, title, description, actions, children, size = "md", closeLabel = "Cerrar", dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fires for every close (prop change, Escape, form method="dialog").
  const handleClose = () => {
    opener.current?.focus();
    opener.current = null;
    if (open) onClose();
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (dismissible) onClose();
  };

  // The dialog box has no padding: a click whose target is the <dialog> itself hit the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, styles[size])}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleClose}
      onCancel={handleCancel}
      onClick={handleClick}
    >
      <div className={styles.box}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button variant="tertiary" size="sm" iconOnly aria-label={closeLabel} icon={<CloseIcon />} onClick={onClose} />
        </header>
        <div className={styles.body}>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
          {children}
        </div>
        {actions && <footer className={styles.footer}>{actions}</footer>}
      </div>
    </dialog>
  );
}

/** State for one dialog: `<Button onClick={dialog.show}>` + `<Dialog {...dialog.props}>`. */
export function useDialog(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, show, close, props: { open, onClose: close } };
}
