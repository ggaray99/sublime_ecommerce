"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorMessage } from "@/server/auth/errors";
import { getAuth } from "@/server/auth/neon";
import { CustomerDataError } from "@/server/customers/repository";
import { accountsAvailable, getCurrentCustomer, getCustomerRepository } from "@/server/customers/session";
import { parseAddress, parseProfile, parseSignIn, parseSignUp } from "@/server/customers/validation";

export type FormState = {
  error?: string;
  fields?: Record<string, string | undefined>;
  ok?: string;
  /** Non-secret values echoed back so a failed submit does not clear them. */
  values?: Record<string, string>;
};

const UNAVAILABLE: FormState = { error: "Las cuentas de cliente todavía no están habilitadas en este sitio." };

export async function signUpAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = parseSignUp(form);
  if (!parsed.ok) return { fields: parsed.errors, values };
  const { error } = await getAuth().signUp.email(parsed.value);
  if (error) return { error: authErrorMessage(error, "sign-up"), values };
  redirect("/cuenta");
}

export async function signInAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const values = { email: String(form.get("email") ?? "") };
  const parsed = parseSignIn(form);
  if (!parsed.ok) return { fields: parsed.errors, values };
  const { error } = await getAuth().signIn.email(parsed.value);
  if (error) return { error: authErrorMessage(error), values };
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
