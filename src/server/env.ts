/**
 * Which deployment this process serves. On the VPS each container sets
 * SUBLIME_ENV (production | staging); VERCEL_ENV is still honored while the
 * Vercel deployments exist, so their production stays guarded.
 */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SUBLIME_ENV === "production" || env.VERCEL_ENV === "production";
}
