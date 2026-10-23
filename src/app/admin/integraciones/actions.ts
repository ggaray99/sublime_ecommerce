"use server";

import { revalidatePath } from "next/cache";
import { formValues, requireOwner, type AdminFormState } from "@/server/admin/guard";
import { getApiKeyRepository } from "@/server/admin/session";
import { API_SCOPES, ApiKeyError, type ApiScope } from "@/server/api/keys";

/** The full key travels back once, in this response; it is never stored nor shown again. */
export type CreateKeyState = AdminFormState & { token?: string; keyName?: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createApiKeyAction(_state: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const admin = await requireOwner();
  const values = formValues(form);
  const name = (values.name ?? "").trim().toLowerCase();
  const scopes = form.getAll("scopes").map(String).filter((scope): scope is ApiScope => (API_SCOPES as readonly string[]).includes(scope));

  const fields: Record<string, string> = {};
  if (!NAME.test(name) || name.length > 40) fields.name = "Usá minúsculas, números y guiones (ej.: n8n-precios), hasta 40 caracteres.";
  if (!scopes.length) fields.scopes = "Elegí al menos un permiso.";
  if (Object.keys(fields).length) return { fields, values };

  try {
    const { key, token } = await getApiKeyRepository().createKey(admin, name, scopes);
    revalidatePath("/admin/integraciones");
    return { token, keyName: key.name };
  } catch (error) {
    if (error instanceof ApiKeyError) return { error: error.message, values };
    throw error;
  }
}

export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const admin = await requireOwner();
  await getApiKeyRepository().revokeKey(admin, String(form.get("keyId") ?? ""));
  revalidatePath("/admin/integraciones");
}
