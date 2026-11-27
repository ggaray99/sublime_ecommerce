import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import styles from "./breadcrumbs.module.css";

export type BreadcrumbItem = { label: ReactNode; href?: string };

/** Trail to the current page; the last item is the current one (aria-current="page"). */
export function Breadcrumbs({ items, label = "Migas de pan" }: { items: BreadcrumbItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={index} className={styles.item}>
              {index > 0 && (
                <span className={styles.separator} aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
              )}
              {current ? (
                <span aria-current="page" className={styles.current}>
                  {item.label}
                </span>
              ) : item.href ? (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
