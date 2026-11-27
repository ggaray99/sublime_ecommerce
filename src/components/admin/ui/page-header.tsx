import type { ReactNode } from "react";
import { Button } from "./button";
import { ArrowLeftIcon } from "./icons";
import styles from "./page-header.module.css";

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A <Breadcrumbs> above the title. */
  breadcrumbs?: ReactNode;
  /** Icon-only back link beside the title; `label` names it ("Volver a Productos"). */
  back?: { href: string; label: string };
  /** Badges or short facts next to the title (e.g. a status Badge). */
  meta?: ReactNode;
  /** The main action (one primary Button). */
  primaryAction?: ReactNode;
  /** Other actions (secondary/tertiary Buttons), before the primary one. */
  secondaryActions?: ReactNode;
};

/** The page's <h1> with its context and actions (Shopify "Page" header). */
export function PageHeader({ title, subtitle, breadcrumbs, back, meta, primaryAction, secondaryActions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {breadcrumbs && <div className={styles.breadcrumbs}>{breadcrumbs}</div>}
      <div className={styles.row}>
        <div className={styles.heading}>
          {back && <Button href={back.href} variant="tertiary" iconOnly aria-label={back.label} icon={<ArrowLeftIcon size={18} />} />}
          <div className={styles.titles}>
            <div className={styles.titleLine}>
              <h1 className={styles.title}>{title}</h1>
              {meta && <div className={styles.meta}>{meta}</div>}
            </div>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {(primaryAction || secondaryActions) && (
          <div className={styles.actions}>
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}
