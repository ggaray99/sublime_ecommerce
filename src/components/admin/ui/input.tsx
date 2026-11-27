import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names.ts";
import { FieldShell, useFieldIds, type FieldProps } from "./field";
import styles from "./field.module.css";

export type InputProps = FieldProps &
  Omit<ComponentPropsWithRef<"input">, "prefix" | "id" | "className"> & {
    /** Text or icon inside the box, before the value (e.g. "$"). */
    prefix?: ReactNode;
    /** Text or icon inside the box, after the value (e.g. "%"). */
    suffix?: ReactNode;
  };

/** Text input with label, hint and error. Works in plain server-action forms. */
export function Input({ label, labelHidden, hint, error, required, id, className, prefix, suffix, disabled, ...props }: InputProps) {
  const field = useFieldIds(id, hint, error, props["aria-describedby"]);
  return (
    <FieldShell id={field.id} label={label} labelHidden={labelHidden} hint={hint} error={error} required={required} className={className}>
      <div className={cx(styles.control, field.invalid && styles.invalid, disabled && styles.disabled)}>
        {prefix && (
          <span className={styles.affix} aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          {...props}
          id={field.id}
          className={styles.input}
          required={required}
          disabled={disabled}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.describedBy}
        />
        {suffix && (
          <span className={styles.affix} aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}
