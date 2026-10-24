"use client";

import { useActionState } from "react";
import { savePointAction } from "@/app/admin/puntos/actions";
import type { AdminFormState } from "@/server/admin/guard";
import { Checkbox, Field, Status, type Option } from "./forms";

export type PointFormValues = {
  pointId?: string;
  name: string;
  kind: string;
  address: string;
  city: string;
  province: string;
  location: string;
  hours: string;
  phone: string;
  instagram: string;
  notes: string;
  sortOrder: string;
  active: boolean;
};

type TextKey = Exclude<keyof PointFormValues, "pointId" | "active">;

export function PointForm({ initial, kinds, provinces }: { initial: PointFormValues; kinds: Option[]; provinces: readonly string[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePointAction, {});
  const value = (key: TextKey) => state.values?.[key] ?? initial[key];
  const provinceOptions = [{ value: "", label: "Elegí una provincia" }, ...provinces.map((province) => ({ value: province, label: province }))];

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {initial.pointId && <input type="hidden" name="pointId" value={initial.pointId} />}
      <div className="form-grid">
        <Field name="name" label="Nombre del lugar" state={state} defaultValue={value("name")} required />
        <Field name="kind" label="Tipo" state={state} defaultValue={value("kind")} options={kinds} />
        <Field name="address" label="Dirección" state={state} defaultValue={value("address")} hint="Calle y número." required />
        <Field name="city" label="Localidad" state={state} defaultValue={value("city")} required />
        <Field name="province" label="Provincia" state={state} defaultValue={value("province")} options={provinceOptions} required />
        <Field
          name="location"
          label="Ubicación exacta en el mapa"
          state={state}
          defaultValue={value("location")}
          hint="Opcional. En Google Maps buscá el lugar, tocá “Compartir” y pegá el link; o escribí “latitud, longitud”. Sin esto, el mapa busca la dirección."
        />
        <Field name="hours" label="Horarios" state={state} defaultValue={value("hours")} hint="Ej.: lunes a sábado de 10 a 20 h." />
        <Field name="phone" label="Teléfono" state={state} defaultValue={value("phone")} inputMode="numeric" />
        <Field name="instagram" label="Instagram" state={state} defaultValue={value("instagram")} hint="Usuario o link del perfil." />
        <Field name="sortOrder" label="Orden" state={state} defaultValue={value("sortOrder")} inputMode="numeric" hint="Menor primero, dentro de cada localidad." />
      </div>
      <Field name="notes" label="Qué se consigue ahí" state={state} defaultValue={value("notes")} hint="Ej.: stickers sueltos y packs. Lo ve el público." multiline />
      <Checkbox
        name="active"
        label="Mostrar en el mapa"
        defaultChecked={state.values ? state.values.active === "on" : initial.active}
        hint="Desactivalo para ocultarlo sin borrarlo."
      />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : initial.pointId ? "Guardar cambios" : "Crear punto de venta"}
      </button>
    </form>
  );
}
