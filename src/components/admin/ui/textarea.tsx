import type { ComponentPropsWithRef } from "react";
import { cx } from "./class-names.ts";
import { FieldShell, useFieldIds, type FieldProps } from "./field";
import styles from "./field.module.css";

export type TextareaProps = FieldProps & Omit<ComponentPropsWithRef<"textarea">, "id" | "className">;

/** Multi-line text with the same field API as Input. */
export function Textarea({ label, labelHidden, hint, error, required, id, className, disabled, rows = 4, ...props }: TextareaProps) {
  const field = useFieldIds(id, hint, error, props["aria-describedby"]);
  return (
    <FieldShell id={field.id} label={label} labelHidden={labelHidden} hint={hint} error={error} required={required} className={className}>
      <div className={cx(styles.control, field.invalid && styles.invalid, disabled && styles.disabled)}>
        <textarea
          {...props}
          id={field.id}
          rows={rows}
          className={cx(styles.input, styles.textarea)}
          required={required}
          disabled={disabled}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.describedBy}
        />
      </div>
    </FieldShell>
  );
}
