import type { ReactNode } from "react";
import { Badge } from "./badge";
import { cx } from "./class-names.ts";
import { ChartIcon, InboxIcon } from "./icons";
import type { HeadingLevel } from "./card";
import styles from "./empty-state.module.css";

export type EmptyStateProps = {
  heading: ReactNode;
  headingLevel?: HeadingLevel;
  /** Description under the heading. */
  children?: ReactNode;
  /** Icon or illustration (decorative). */
  icon?: ReactNode;
  /** A Button or link that resolves the empty state. */
  action?: ReactNode;
  /**
   * "empty": nothing to show yet (default).
   * "unavailable": the data does not exist yet in the system; shows the
   * "Datos todavía no disponibles" label so nobody reads it as a real zero.
   */
  variant?: "empty" | "unavailable";
  /** "card" draws its own surface; "plain" sits inside a Card or table. */
  appearance?: "card" | "plain";
  className?: string;
};

export const UNAVAILABLE_LABEL = "Datos todavía no disponibles";

export function EmptyState({
  heading,
  headingLevel = 2,
  children,
  icon,
  action,
  variant = "empty",
  appearance = "plain",
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  const unavailable = variant === "unavailable";
  return (
    <div className={cx(styles.root, appearance === "card" && styles.card, unavailable && styles.unavailable, className)}>
      <span className={styles.icon} aria-hidden="true">
        {icon ?? (unavailable ? <ChartIcon size={24} /> : <InboxIcon size={24} />)}
      </span>
      {unavailable && <Badge tone="attention">{UNAVAILABLE_LABEL}</Badge>}
      <Heading className={styles.heading}>{heading}</Heading>
      {children && <div className={styles.description}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
