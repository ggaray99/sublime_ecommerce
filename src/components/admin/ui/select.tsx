import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names.ts";
import { FieldShell, useFieldIds, type FieldProps } from "./field";
import { ChevronDownIcon } from "./icons";
import styles from "./field.module.css";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = FieldProps &
  Omit<ComponentPropsWithRef<"select">, "id" | "className"> & {
    /** Options; or pass <option> children instead. */
    options?: SelectOption[];
    /** First empty option (value ""), e.g. "Todas las categorías". */
    placeholder?: string;
    children?: ReactNode;
  };

/** Native <select> styled like the inputs, with the same field API. */
export function Select({ label, labelHidden, hint, error, required, id, className, options, placeholder, disabled, children, ...props }: SelectProps) {
  const field = useFieldIds(id, hint, error, props["aria-describedby"]);
  return (
    <FieldShell id={field.id} label={label} labelHidden={labelHidden} hint={hint} error={error} required={required} className={className}>
      <div className={cx(styles.control, styles.selectControl, field.invalid && styles.invalid, disabled && styles.disabled)}>
        <select
          {...props}
          id={field.id}
          className={cx(styles.input, styles.select)}
          required={required}
          disabled={disabled}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.describedBy}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </div>
    </FieldShell>
  );
}
