import { useId, type ReactNode } from "react";
import type { HeadingLevel } from "./card";
import styles from "./form-section.module.css";

export type FormSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  headingLevel?: HeadingLevel;
  /** The fields (Input, Select, Textarea…), shown in a card. */
  children: ReactNode;
  /** Optional card footer, e.g. a save Button for this section. */
  footer?: ReactNode;
  id?: string;
};

/**
 * Settings-style section: title and description on the left, the fields in a
 * card on the right; stacked below 900px. Put it inside any <form> (also a
 * server-action form): it renders no form of its own.
 */
export function FormSection({ title, description, headingLevel = 2, children, footer, id }: FormSectionProps) {
  const Heading = `h${headingLevel}` as const;
  const generated = useId();
  const titleId = `${id ?? generated}-title`;
  return (
    <section id={id} className={styles.section} aria-labelledby={titleId}>
      <div className={styles.intro}>
        <Heading id={titleId} className={styles.title}>
          {title}
        </Heading>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      <div className={styles.card}>
        <div className={styles.fields}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </section>
  );
}
