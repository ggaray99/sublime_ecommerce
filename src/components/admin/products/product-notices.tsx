"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/admin/ui";
import styles from "./product-page.module.css";

export type ProductNotice = { message: string; tone: "success" | "critical" };

/**
 * One-time notices from the URL (?creado=1, ?copia=1, ?imagen=error). With
 * JavaScript they become toasts and the query is removed with router.replace
 * (no history entry), so a reload does not repeat them. Without JavaScript the
 * inline text stays.
 */
export function ProductNotices({ notices }: { notices: ProductNotice[] }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const done = useRef(false);

  useEffect(() => {
    if (!notices.length) {
      done.current = false;
      return;
    }
    if (done.current) return;
    done.current = true;
    for (const notice of notices) toast.show(notice.message, { tone: notice.tone });
    // Without the query the server renders no notices, so the inline copy goes away too.
    router.replace(pathname, { scroll: false });
  }, [notices, toast, router, pathname]);

  if (!notices.length) return null;
  return (
    <div className={styles.grid2Stack}>
      {notices.map((notice) => (
        <p key={notice.message} className={notice.tone === "critical" ? styles.noticeCritical : styles.notice} role={notice.tone === "critical" ? "alert" : "status"}>
          {notice.message}
        </p>
      ))}
    </div>
  );
}
