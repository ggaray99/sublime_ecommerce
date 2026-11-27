import { useId, type ReactNode } from "react";
import { cx } from "./class-names.ts";
import { AlertCircleIcon } from "./icons";
import styles from "./field.module.css";
import utilities from "./utilities.module.css";

/** The label/hint/error API shared by Input, Select and Textarea. */
export type FieldProps = {
  label: ReactNode;
  /** Hides the label visually; it still names the control. */
  labelHidden?: boolean;
  /** Help text shown under the control (never as a placeholder). */
  hint?: ReactNode;
  /** Error message; marks the control aria-invalid. */
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
};

type FieldIds = { id: string; describedBy: string | undefined; invalid: boolean };

/** Ids for the control, the hint and the error, wired with aria-describedby. */
export function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode, describedBy?: string): FieldIds {
  const generated = useId();
  const controlId = id ?? generated;
  const ids = [describedBy, hint ? `${controlId}-hint` : undefined, error ? `${controlId}-error` : undefined].filter(Boolean);
  return { id: controlId, describedBy: ids.length ? ids.join(" ") : undefined, invalid: Boolean(error) };
}

export function FieldShell({
  id,
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  children,
}: Omit<FieldProps, "id"> & { id: string; children: ReactNode }) {
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={cx(styles.label, labelHidden && utilities.visuallyHidden)}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <AlertCircleIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
