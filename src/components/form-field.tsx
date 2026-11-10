"use client";

import { useId } from "react";

/** Labeled input, select or textarea with its hint and error. Shared by the store and the admin panel. */
export type Option = { value: string; label: string };

type FieldProps = {
  name: string;
  label: string;
  /** Any action state with per-field errors (admin forms, checkout…). */
  state: { fields?: Record<string, string | undefined> };
  defaultValue: string;
  hint?: string;
  options?: Option[];
  multiline?: boolean;
  inputMode?: "numeric" | "decimal";
  required?: boolean;
};

export function Field({ name, label, state, defaultValue, hint, options, multiline, inputMode, required }: FieldProps) {
  const id = useId();
  const error = state.fields?.[name];
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, name, defaultValue, "aria-invalid": Boolean(error), "aria-describedby": describedBy };
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      {/* Inputs show the hint inside, as a placeholder, so labels and inputs stay aligned across columns;
          screen readers still get it as the field description. Selects have no placeholder: theirs goes below. */}
      {hint && !options && (
        <p className="visually-hidden" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {options ? (
        // React resets forms after an action, and a select returns to the option it was first rendered with.
        // Keying it by the default remounts it with the saved value, so the reset lands on what was saved.
        <select key={defaultValue} {...common}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea {...common} rows={4} placeholder={hint} />
      ) : (
        <input {...common} type="text" inputMode={inputMode} autoComplete="off" placeholder={hint} />
      )}
      {hint && options && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
