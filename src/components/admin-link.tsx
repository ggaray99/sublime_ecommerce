import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getCurrentAdmin } from "@/server/admin/session";

/**
 * Shortcut to the panel, only for signed-in users listed in admin_users (the same
 * check /admin runs). Reads the session, so the header renders it inside <Suspense>.
 * Showing it grants nothing: every admin page and action checks again.
 */
export async function AdminLink() {
  let admin = null;
  try {
    admin = await getCurrentAdmin();
  } catch (error) {
    // Next's own signals (this part reads the request) must pass through.
    unstable_rethrow(error);
    // A failing lookup only hides the shortcut: it never breaks the store's pages.
    console.error("[admin-link] admin lookup failed", error instanceof Error ? error.message : "unknown error");
  }
  if (!admin) return null;
  return (
    <Link className="admin-link" href="/admin" prefetch={false} aria-label="Panel de administración" title="Panel de administración">
      <svg className="admin-link__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
          transform="translate(-1 0)"
        />
      </svg>
      <span>Admin</span>
    </Link>
  );
}
