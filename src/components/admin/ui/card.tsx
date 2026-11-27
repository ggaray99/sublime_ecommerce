import type { ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./card.module.css";

export type HeadingLevel = 2 | 3 | 4;

export type CardProps = {
  title?: ReactNode;
  headingLevel?: HeadingLevel;
  /** Buttons or links at the right of the header. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** "none" for edge-to-edge content such as a DataTable. */
  padding?: "md" | "none";
  /** Renders a <section> named by its title instead of a <div>. */
  section?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
};

/** White surface on the grey canvas, with optional header and footer. */
export function Card({ title, headingLevel = 2, actions, footer, padding = "md", section, id, className, children }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  const titleId = id ? `${id}-title` : undefined;
  const Root = section ? "section" : "div";
  return (
    <Root id={id} className={cx(styles.card, className)} aria-labelledby={section && titleId ? titleId : undefined}>
      {(title || actions) && (
        <div className={styles.header}>
          {title && (
            <Heading id={titleId} className={styles.title}>
              {title}
            </Heading>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className={cx(styles.body, padding === "none" && styles.flush)}>{children}</div>}
      {footer && <div className={styles.footer}>{footer}</div>}
    </Root>
  );
}
