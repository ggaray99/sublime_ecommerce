import type { ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./badge.module.css";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "critical" | "attention";

export type BadgeProps = {
  tone?: BadgeTone;
  /** A small coloured dot before the text; the text still carries the meaning. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

/** Status label (e.g. "Publicado", "En revisión"). Never relies on colour alone. */
export function Badge({ tone = "neutral", dot, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
