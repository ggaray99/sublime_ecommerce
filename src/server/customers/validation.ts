export const PROVINCES = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export const MAX_ADDRESSES = 10;

export type AddressInput = {
  label: string;
  recipient: string;
  street: string;
  streetNumber: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

export type ProfileInput = { fullName: string; phone: string | null };

export type FieldErrors<T> = Partial<Record<keyof T, string>>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors<T> };

type Reader = { get(name: string): FormDataEntryValue | null };
const text = (form: Reader, name: string) => String(form.get(name) ?? "").trim();

function bounded<T>(errors: FieldErrors<T>, key: keyof T, value: string, min: number, max: number, label: string) {
  if (value.length < min) errors[key] = min === 1 ? `Completá ${label}.` : `${label} necesita al menos ${min} caracteres.`;
  else if (value.length > max) errors[key] = `${label} puede tener hasta ${max} caracteres.`;
}

/** Normalizes CPA (C1425ABC) or 4-digit postal codes to upper case without spaces. */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function parseAddress(form: Reader): Validated<AddressInput> {
  const value: AddressInput = {
    label: text(form, "label"),
    recipient: text(form, "recipient"),
    street: text(form, "street"),
    streetNumber: text(form, "streetNumber"),
    apartment: text(form, "apartment"),
    city: text(form, "city"),
    province: text(form, "province"),
    postalCode: normalizePostalCode(text(form, "postalCode")),
    notes: text(form, "notes"),
  };
  const errors: FieldErrors<AddressInput> = {};
  bounded(errors, "label", value.label, 0, 40, "La etiqueta");
  bounded(errors, "recipient", value.recipient, 1, 120, "quién recibe");
  bounded(errors, "street", value.street, 1, 120, "la calle");
  bounded(errors, "streetNumber", value.streetNumber, 1, 10, "la altura");
  bounded(errors, "apartment", value.apartment, 0, 20, "Piso/depto");
  bounded(errors, "city", value.city, 1, 80, "la localidad");
  bounded(errors, "notes", value.notes, 0, 200, "Las indicaciones");
  if (!(PROVINCES as readonly string[]).includes(value.province)) errors.province = "Elegí una provincia.";
  if (!/^([A-Z][0-9]{4}[A-Z]{3}|[0-9]{4})$/.test(value.postalCode)) {
    errors.postalCode = "Código postal inválido (por ejemplo, C1425ABC o 5500).";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function parseProfile(form: Reader): Validated<ProfileInput> {
  const fullName = text(form, "fullName");
  const phone = text(form, "phone");
  const errors: FieldErrors<ProfileInput> = {};
  bounded(errors, "fullName", fullName, 1, 120, "tu nombre");
  if (phone && !/^[0-9+() -]{6,30}$/.test(phone)) errors.phone = "Teléfono inválido (solo números, espacios, +, guiones y paréntesis).";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { fullName, phone: phone || null } };
}

export type CredentialsInput = { name: string; email: string; password: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sign-up form: name, email and a password of 8–128 characters. */
export function parseSignUp(form: Reader): Validated<CredentialsInput> {
  const value = { name: text(form, "name"), email: text(form, "email").toLowerCase(), password: String(form.get("password") ?? "") };
  const errors: FieldErrors<CredentialsInput> = {};
  bounded(errors, "name", value.name, 1, 120, "tu nombre");
  if (!EMAIL.test(value.email)) errors.email = "Ingresá un email válido.";
  if (value.password.length < 8) errors.password = "La contraseña necesita al menos 8 caracteres.";
  else if (value.password.length > 128) errors.password = "La contraseña puede tener hasta 128 caracteres.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function parseSignIn(form: Reader): Validated<Omit<CredentialsInput, "name">> {
  const value = { email: text(form, "email").toLowerCase(), password: String(form.get("password") ?? "") };
  const errors: FieldErrors<Omit<CredentialsInput, "name">> = {};
  if (!EMAIL.test(value.email)) errors.email = "Ingresá un email válido.";
  if (!value.password) errors.password = "Ingresá tu contraseña.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
