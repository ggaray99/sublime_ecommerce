"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorMessage } from "@/server/auth/errors";
import { getAuth } from "@/server/auth/server";
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
  try {
    await getAuth().api.signUpEmail({ body: parsed.value, headers: await headers() });
  } catch (error) {
    return { error: authErrorMessage(authError(error), "sign-up"), values };
  }
  redirect("/cuenta");
}

export async function signInAction(_state: FormState, form: FormData): Promise<FormState> {
  if (!accountsAvailable()) return UNAVAILABLE;
  const values = { email: String(form.get("email") ?? "") };
  const parsed = parseSignIn(form);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getAuth().api.signInEmail({ body: parsed.value, headers: await headers() });
  } catch (error) {
    return { error: authErrorMessage(authError(error)), values };
  }
  redirect("/cuenta");
}

export async function signOutAction(): Promise<void> {
  if (accountsAvailable()) await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}

/** Better Auth throws APIError with a code (USER_ALREADY_EXISTS…) and an HTTP status. */
function authError(error: unknown) {
  if (error instanceof APIError) return { code: error.body?.code, status: error.statusCode };
  throw error;
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
