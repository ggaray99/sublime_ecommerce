import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./link-tabs.module.css";

export type LinkTab = {
  label: ReactNode;
  href: string;
  current?: boolean;
  /** Count shown in a pill; tabs with 0 are dimmed. */
  count?: number;
};

/**
 * List filter tabs as links (aria-current="page"), not an ARIA tab widget:
 * each tab is a URL, so they work without JavaScript and in the history.
 */
export function LinkTabs({ tabs, label }: { tabs: LinkTab[]; label: string }) {
  return (
    <nav aria-label={label} className={styles.nav}>
      <ul className={styles.list}>
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link href={tab.href} aria-current={tab.current ? "page" : undefined} className={cx(styles.tab, tab.count === 0 && styles.empty)}>
              <span>{tab.label}</span>
              {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
