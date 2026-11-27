"use client";

import { useEffect, useId, useRef, type MouseEvent } from "react";
import { useToast } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import { errorSummaryItems } from "./product-page-helpers";
import styles from "./product-page.module.css";

/** Id of a product form field, shared by the control and the error summary link. */
export const fieldId = (prefix: string, field: string) => `${prefix}-${field}`;

/** A successful save also shows a toast (the inline "Cambios guardados." stays next to the button). */
export function useSaveToast(state: AdminFormState) {
  const toast = useToast();
  const shown = useRef<AdminFormState | null>(null);
  useEffect(() => {
    if (state.ok && shown.current !== state) {
      shown.current = state;
      toast.show(state.ok, { tone: "success" });
    }
  }, [state, toast]);
}

/**
 * Errors of the last save at the top of its card: a general message and a link
 * to each invalid field. Takes focus after every failed save.
 */
export function ErrorSummary({ state, labels, idPrefix }: { state: AdminFormState; labels: Record<string, string>; idPrefix: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const items = errorSummaryItems(state.fields, labels);
  const visible = Boolean(state.error) || items.length > 0;

  useEffect(() => {
    if (visible) ref.current?.focus();
  }, [state, visible]);

  if (!visible) return null;

  function jump(event: MouseEvent<HTMLAnchorElement>, field: string) {
    const control = document.getElementById(fieldId(idPrefix, field));
    if (!control) return;
    event.preventDefault();
    control.scrollIntoView({ block: "center" });
    control.focus();
  }

  return (
    <div ref={ref} className={styles.summary} role="alert" tabIndex={-1} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.summaryTitle}>
        {items.length ? (items.length === 1 ? "Revisá 1 campo" : `Revisá ${items.length} campos`) : "No se pudo guardar"}
      </h3>
      {state.error && <p className={styles.text}>{state.error}</p>}
      {items.length > 0 && (
        <ul className={styles.summaryList}>
          {items.map((item) => (
            <li key={item.field}>
              {item.label ? (
                <a href={`#${fieldId(idPrefix, item.field)}`} onClick={(event) => jump(event, item.field)}>
                  {item.label}: {item.message}
                </a>
              ) : (
                item.message
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Cambios guardados." beside the save button. The toast announces it; this text stays visible. */
export function SavedMessage({ state }: { state: AdminFormState }) {
  return state.ok ? <span className={styles.saved}>{state.ok}</span> : null;
}

type CheckboxProps = {
  id: string;
  name: string;
  label: string;
  defaultChecked: boolean;
  hint?: string;
  /** Associates the box with a form elsewhere on the page. */
  form?: string;
};

/** Native checkbox with its label (and hint below), in the design-system look. */
export function ProductCheckbox({ id, name, label, defaultChecked, hint, form }: CheckboxProps) {
  return (
    <div className={styles.check}>
      <input id={id} name={name} type="checkbox" form={form} defaultChecked={defaultChecked} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className={styles.checkHint}>
          {hint}
        </p>
      )}
    </div>
  );
}
