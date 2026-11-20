"use client";

import { useActionState } from "react";
import { Status } from "@/components/admin/forms";
import type { MockupKind } from "@/lib/designs/kinds";
import { saveMockupBaseAction } from "./actions";

export type BaseOption = { value: string; label: string };

/** One base kind: pick the product it sells through, or none. */
export function MockupBaseForm({ kind, label, current, options }: { kind: MockupKind; label: string; current: string; options: BaseOption[] }) {
  const [state, action, pending] = useActionState(saveMockupBaseAction, {});
  const selectId = `base-${kind}`;
  return (
    <form action={action} className="quote-form soportes-form">
      <Status state={state} />
      <input type="hidden" name="kind" value={kind} />
      <div className="field">
        <label htmlFor={selectId}>Producto base de {label.toLowerCase()}</label>
        <select id={selectId} name="productId" defaultValue={state.values?.productId ?? current}>
          <option value="">Sin producto base</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
