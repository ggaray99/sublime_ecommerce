/**
 * Which deployment this process serves. On the VPS each container sets
 * SUBLIME_ENV (production | staging); VERCEL_ENV is still honored while the
 * Vercel deployments exist, so their production stays guarded.
 */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SUBLIME_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Whether search engines may index the store. Off until launch: production
 * must also set SITE_INDEXABLE=true, and staging never gets indexed. Read at
 * build time (each environment builds with its own env file).
 */
export function isSiteIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  return isProductionEnv(env) && env.SITE_INDEXABLE === "true";
}
