"use client";

import { useActionState, useState } from "react";
import { savePickupAction, saveShippingRuleAction } from "@/app/admin/envios/actions";
import type { AdminFormState } from "@/server/admin/guard";
import { Checkbox, Field, Status } from "./forms";

export type RuleFormValues = {
  ruleId?: string;
  scope: string;
  label: string;
  province: string;
  city: string;
  postalFrom: string;
  postalTo: string;
  cost: string;
  freeFrom: string;
  etaMinDays: string;
  etaMaxDays: string;
  available: boolean;
  active: boolean;
};

const SCOPES = [
  { value: "postal_code", label: "Código postal (o rango)" },
  { value: "city", label: "Localidad" },
  { value: "province", label: "Provincia" },
  { value: "default", label: "Resto del país (por defecto)" },
];

export function ShippingRuleForm({ initial, provinces }: { initial: RuleFormValues; provinces: readonly string[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveShippingRuleAction, {});
  const value = (key: Exclude<keyof RuleFormValues, "available" | "active" | "ruleId">) => state.values?.[key] ?? initial[key];
  const [scope, setScope] = useState(value("scope"));
  const [available, setAvailable] = useState(state.values ? state.values.available === "on" : initial.available);
  const provinceOptions = [{ value: "", label: "Elegí una provincia" }, ...provinces.map((province) => ({ value: province, label: province }))];

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {initial.ruleId && <input type="hidden" name="ruleId" value={initial.ruleId} />}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`scope-${initial.ruleId ?? "new"}`}>Tipo</label>
          <select id={`scope-${initial.ruleId ?? "new"}`} name="scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            {SCOPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Field name="label" label="Nombre" state={state} defaultValue={value("label")} hint="Lo ve el cliente (ej.: Gran Mendoza)." required />
        {scope === "postal_code" && (
          <>
            <Field name="postalFrom" label="CP desde" state={state} defaultValue={value("postalFrom")} hint="4 dígitos (5500)." inputMode="numeric" required />
            <Field name="postalTo" label="CP hasta" state={state} defaultValue={value("postalTo")} hint="Vacío = solo ese CP." inputMode="numeric" />
          </>
        )}
        {(scope === "city" || scope === "province") && (
          <Field name="province" label="Provincia" state={state} defaultValue={value("province")} options={provinceOptions} required />
        )}
        {scope === "city" && <Field name="city" label="Localidad" state={state} defaultValue={value("city")} required />}
      </div>
      <div className="field field--check">
        <input id={`available-${initial.ruleId ?? "new"}`} name="available" type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />
        <label htmlFor={`available-${initial.ruleId ?? "new"}`}>Hacemos envíos a esta zona</label>
        <p className="field__hint">Desmarcalo para indicar “sin cobertura” (el cliente puede elegir retiro).</p>
      </div>
      {available && (
        <div className="form-grid">
          <Field name="cost" label="Costo (ARS)" state={state} defaultValue={value("cost")} hint="0 = sin cargo." inputMode="decimal" required />
          <Field name="freeFrom" label="Gratis desde (ARS)" state={state} defaultValue={value("freeFrom")} hint="Subtotal de productos. Vacío = nunca." inputMode="decimal" />
          <Field name="etaMinDays" label="Plazo mínimo (días hábiles)" state={state} defaultValue={value("etaMinDays")} inputMode="numeric" />
          <Field name="etaMaxDays" label="Plazo máximo (días hábiles)" state={state} defaultValue={value("etaMaxDays")} inputMode="numeric" />
        </div>
      )}
      <Checkbox name="active" label="Activa" defaultChecked={state.values ? state.values.active === "on" : initial.active} hint="Las inactivas no se aplican ni cuentan para superposiciones." />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : initial.ruleId ? "Guardar regla" : "Crear regla"}
      </button>
    </form>
  );
}

export function PickupForm({ initial }: { initial: { enabled: boolean; address: string; hours: string; notes: string } }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePickupAction, {});
  const value = (key: "address" | "hours" | "notes") => state.values?.[key] ?? initial[key];
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <Checkbox name="enabled" label="Ofrecer retiro en el taller" defaultChecked={state.values ? state.values.enabled === "on" : initial.enabled} />
      <div className="form-grid">
        <Field name="address" label="Dirección" state={state} defaultValue={value("address")} />
        <Field name="hours" label="Horarios" state={state} defaultValue={value("hours")} hint="Ej.: lunes a viernes de 10 a 18 h." />
      </div>
      <Field name="notes" label="Indicaciones" state={state} defaultValue={value("notes")} />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar retiro"}
      </button>
    </form>
  );
}
