"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import {
  addAddressAction,
  signInAction,
  signUpAction,
  updateProfileAction,
  type FormState,
} from "@/app/cuenta/actions";
import { PROVINCES } from "@/server/customers/validation";

type FieldProps = {
  name: string;
  label: string;
  state: FormState;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
};

function Field({ name, label, state, type = "text", autoComplete, defaultValue, required = false, hint }: FieldProps) {
  const id = useId();
  const error = state.fields?.[name];
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      {/* The hint is shown inside the input as a placeholder, so labels and inputs stay aligned in two-column
          forms; screen readers still get it as the field description. */}
      {hint && (
        <p className="visually-hidden" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={hint}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function Status({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="form-alert" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="panel panel--muted" role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const [state, action, pending] = useActionState(mode === "signin" ? signInAction : signUpAction, {});
  return (
    <form action={action} className="quote-form account-form" noValidate>
      <Status state={state} />
      {mode === "signup" && (
        <Field name="name" label="Nombre" state={state} autoComplete="name" defaultValue={state.values?.name} required />
      )}
      <Field
        name="email"
        label="Email"
        type="email"
        state={state}
        autoComplete="email"
        defaultValue={state.values?.email}
        required
      />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        state={state}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        hint={mode === "signup" ? "Mínimo 8 caracteres." : undefined}
        required
      />
      <button type="submit" className="btn btn--acid btn--lg" disabled={pending}>
        {pending ? "Procesando…" : mode === "signin" ? "Ingresar" : "Crear cuenta"}
      </button>
      <p className="fine-print">
        {mode === "signin" ? (
          <>
            ¿No tenés cuenta? <Link href="/cuenta/registro">Registrate</Link>.
          </>
        ) : (
          <>
            ¿Ya tenés cuenta? <Link href="/cuenta/ingresar">Ingresá</Link>.
          </>
        )}
      </p>
    </form>
  );
}

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <div className="form-grid">
        <Field name="fullName" label="Nombre y apellido" state={state} autoComplete="name" defaultValue={fullName} required />
        <Field name="phone" label="Teléfono" type="tel" state={state} autoComplete="tel" defaultValue={phone ?? ""} />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar datos"}
      </button>
    </form>
  );
}

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddressAction, {});
  const provinceId = useId();
  const provinceError = state.fields?.province;
  return (
    <form action={action} className="quote-form" noValidate key={state.ok ?? "address-form"}>
      <Status state={state} />
      <div className="form-grid">
        <Field name="label" label="Etiqueta" state={state} hint="Ej.: Casa, Trabajo." />
        <Field name="recipient" label="Quién recibe" state={state} autoComplete="name" required />
        <Field name="street" label="Calle" state={state} autoComplete="address-line1" required />
        <Field name="streetNumber" label="Altura" state={state} required />
        <Field name="apartment" label="Piso / depto" state={state} autoComplete="address-line2" />
        <Field name="city" label="Localidad" state={state} autoComplete="address-level2" required />
        <div className="field">
          <label htmlFor={provinceId}>Provincia *</label>
          <select
            id={provinceId}
            name="province"
            defaultValue=""
            autoComplete="address-level1"
            aria-invalid={Boolean(provinceError)}
            aria-describedby={provinceError ? `${provinceId}-error` : undefined}
          >
            <option value="">Elegí una provincia</option>
            {PROVINCES.map((province) => (
              <option key={province}>{province}</option>
            ))}
          </select>
          {provinceError && (
            <p className="field__error" id={`${provinceId}-error`}>
              {provinceError}
            </p>
          )}
        </div>
        <Field name="postalCode" label="Código postal" state={state} autoComplete="postal-code" hint="CPA (C1425ABC) o 4 dígitos." required />
      </div>
      <Field name="notes" label="Indicaciones para la entrega" state={state} />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Agregar dirección"}
      </button>
    </form>
  );
}
