"use client";

import { useActionState, useId } from "react";
import { createApiKeyAction, type CreateKeyState } from "@/app/admin/integraciones/actions";
import { Field, Status } from "./forms";

export function ApiKeyForm({ scopes }: { scopes: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const scopesId = useId();
  const tokenId = useId();
  const scopesError = state.fields?.scopes;

  return (
    <>
      {state.token && (
        <div className="api-token" role="status">
          <p>
            <strong>Clave creada para “{state.keyName}”.</strong> Copiala ahora: no se vuelve a mostrar. Si se pierde, revocala y
            creá otra.
          </p>
          <label htmlFor={tokenId} className="visually-hidden">
            Clave de API
          </label>
          <input id={tokenId} readOnly value={state.token} onFocus={(event) => event.currentTarget.select()} className="api-token__value" />
        </div>
      )}
      <form action={action} className="quote-form" noValidate>
        <Status state={state} />
        <Field
          name="name"
          label="Nombre de la integración"
          state={state}
          defaultValue={state.values?.name ?? ""}
          hint="Quién la usa y para qué, ej.: n8n-precios. Aparece en el historial de cambios."
          required
        />
        <fieldset className="admin-fieldset" aria-describedby={scopesError ? `${scopesId}-error` : undefined}>
          <legend>Permisos</legend>
          {scopes.map((scope) => (
            <div className="field field--check" key={scope.value}>
              <input id={`${scopesId}-${scope.value}`} type="checkbox" name="scopes" value={scope.value} defaultChecked={scope.value === "catalog:read"} />
              <label htmlFor={`${scopesId}-${scope.value}`}>
                {scope.label} <code>{scope.value}</code>
              </label>
            </div>
          ))}
          {scopesError && (
            <p className="field__error" id={`${scopesId}-error`}>
              {scopesError}
            </p>
          )}
        </fieldset>
        <button type="submit" className="btn btn--coal" disabled={pending}>
          {pending ? "Creando…" : "Crear clave"}
        </button>
      </form>
    </>
  );
}
