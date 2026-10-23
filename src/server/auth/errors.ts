/**
 * Neon Auth may surface Better Auth codes (INVALID_EMAIL_OR_PASSWORD), its own
 * normalized codes (invalid_credentials) or only an HTTP status. This maps all
 * of them to Spanish messages without leaking internal details.
 */
type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

const MESSAGES = {
  credentials: "Email o contraseña incorrectos.",
  exists: "Ya existe una cuenta con ese email. Probá ingresar.",
  weakPassword: "La contraseña no cumple los requisitos (mínimo 8 caracteres).",
  invalidEmail: "Ingresá un email válido.",
  notVerified: "Tenés que verificar tu email antes de ingresar.",
  rateLimit: "Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.",
  signUpRejected: "No pudimos crear una cuenta con ese email. Si ya tenés cuenta, probá ingresar.",
  originNotAllowed: "El ingreso no está habilitado desde esta dirección del sitio. Avisá al equipo de Sublime.",
  generic: "No pudimos completar la operación. Probá de nuevo en unos minutos.",
} as const;

const BY_CODE: Record<string, keyof typeof MESSAGES> = {
  invalid_email_or_password: "credentials",
  invalid_password: "credentials",
  invalid_credentials: "credentials",
  user_not_found: "credentials",
  user_email_not_found: "credentials",
  credential_account_not_found: "credentials",
  user_already_exists: "exists",
  user_already_exists_use_another_email: "exists",
  email_exists: "exists",
  password_too_short: "weakPassword",
  password_too_long: "weakPassword",
  weak_password: "weakPassword",
  invalid_email: "invalidEmail",
  email_address_invalid: "invalidEmail",
  email_not_verified: "notVerified",
  email_not_confirmed: "notVerified",
  over_request_rate_limit: "rateLimit",
  too_many_requests: "rateLimit",
};

/**
 * `context` disambiguates generic answers: Neon Auth reports an already registered
 * email on sign-up as `validation_failed` / 422. Our own validation already checked
 * the email format and password length, so on sign-up that answer means the email
 * cannot be used — most likely because it already has an account.
 */
export function authErrorMessage(error: AuthErrorLike, context: "sign-in" | "sign-up" = "sign-in"): string {
  const kind = error?.code ? BY_CODE[error.code.toLowerCase()] : undefined;
  if (kind) return MESSAGES[kind];
  // Neon Auth answers requests from domains missing in its trusted list with 403.
  if (error?.status === 403 || error?.code === "feature_not_supported") {
    console.warn("[auth] rejected origin: add this deployment's domain in Neon Console → Auth → Domains");
    return MESSAGES.originNotAllowed;
  }
  if (context === "sign-up" && (error?.code === "validation_failed" || error?.status === 422)) {
    return MESSAGES.signUpRejected;
  }
  if (error?.status === 401) return MESSAGES.credentials;
  if (error?.status === 429) return MESSAGES.rateLimit;
  // Unmapped: log only the code and status (never the message, which may carry user data).
  console.warn("[auth] unmapped error", { code: error?.code ?? null, status: error?.status ?? null });
  return MESSAGES.generic;
}
