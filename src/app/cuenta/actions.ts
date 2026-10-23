"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/neon";
import { CustomerDataError } from "@/server/customers/repository";
import { accountsAvailable, getCurrentCustomer, getCustomerRepository } from "@/server/customers/session";
import { parseAddress, parseProfile, parseSignIn, parseSignUp } from "@/server/customers/validation";

export type FormState = { error?: string; fields?: Record<string, string | undefined>; ok?: string };

const UNAVAILABLE: FormState = { error: "Las cuentas de cliente todavía no están habilitadas en este sitio." };

/** Maps Neon Auth (Better Auth) error codes to Spanish messages without leaking internals. */
function authMessage(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Ya existe una cuenta con ese email. Probá ingresar.";
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
      return "Email o contraseña incorrectos.";
    case "PASSWORD_TOO_SHORT":
      return "La contraseña es demasiado corta.";
    case "EMAIL_NOT_VERIFIED":
      return "Tenés que verificar tu email antes de ingresar.";
    default:
      return "No pudimos completar la operación. Probá de nuevo en unos minutos.";
  }
}

export async function signUpAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const parsed = parseSignUp(form);
  if (!parsed.ok) return { fields: parsed.errors };
  const { error } = await getAuth().signUp.email(parsed.value);
  if (error) return { error: authMessage(error) };
  redirect("/cuenta");
}

export async function signInAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const parsed = parseSignIn(form);
  if (!parsed.ok) return { fields: parsed.errors };
  const { error } = await getAuth().signIn.email(parsed.value);
  if (error) return { error: authMessage(error) };
  redirect("/cuenta");
}

export async function signOutAction(): Promise<void> {
  if (accountsAvailable()) await getAuth().signOut();
  redirect("/");
}

/** Every mutation re-resolves the customer from the session; ids from the form are only hints. */
async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/cuenta/ingresar");
  return customer;
}

function dataError(error: unknown): FormState {
  if (error instanceof CustomerDataError) return { error: error.message };
  throw error;
}

export async function updateProfileAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const customer = await requireCustomer();
  const parsed = parseProfile(form);
  if (!parsed.ok) return { fields: parsed.errors };
  await getCustomerRepository().updateProfile(customer.id, parsed.value);
  revalidatePath("/cuenta");
  return { ok: "Datos guardados." };
}

export async function addAddressAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const customer = await requireCustomer();
  const parsed = parseAddress(form);
  if (!parsed.ok) return { fields: parsed.errors };
  try {
    await getCustomerRepository().addAddress(customer.id, parsed.value);
  } catch (error) {
    return dataError(error);
  }
  revalidatePath("/cuenta");
  return { ok: "Dirección agregada." };
}

export async function deleteAddressAction(form: FormData): Promise<void> {
  if (!accountsAvailable()) return;
  const customer = await requireCustomer();
  try {
    await getCustomerRepository().deleteAddress(customer.id, String(form.get("addressId") ?? ""));
  } catch (error) {
    if (!(error instanceof CustomerDataError)) throw error;
  }
  revalidatePath("/cuenta");
}

export async function setDefaultAddressAction(form: FormData): Promise<void> {
  if (!accountsAvailable()) return;
  const customer = await requireCustomer();
  try {
    await getCustomerRepository().setDefaultAddress(customer.id, String(form.get("addressId") ?? ""));
  } catch (error) {
    if (!(error instanceof CustomerDataError)) throw error;
  }
  revalidatePath("/cuenta");
}
