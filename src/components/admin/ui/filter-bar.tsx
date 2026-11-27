import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "./button";
import { SearchIcon } from "./icons";
import { Input } from "./input";
import styles from "./filter-bar.module.css";

export type FilterBarProps = {
  /** Where the GET form goes (the list URL). */
  action: string;
  /** Accessible name of the search form. */
  label?: string;
  /** Search box: query parameter name, label and current value. */
  search?: { name?: string; label?: string; placeholder?: string; defaultValue?: string };
  /** Filter controls (usually <Select> with defaultValue from the URL). */
  filters?: ReactNode;
  /** Values to keep on submit (e.g. the active tab: { estado: "paid" }). */
  hiddenFields?: Record<string, string | undefined>;
  /** "Limpiar filtros" link, shown when there are active filters. */
  clearHref?: string;
  submitLabel?: string;
  /** A <LinkTabs> row above the form. */
  tabs?: ReactNode;
};

/**
 * Search + filters for a list. A plain <form method="get">: it works without
 * JavaScript and keeps the filters in the URL, like the current admin lists.
 */
export function FilterBar({ action, label = "Buscar y filtrar", search, filters, hiddenFields, clearHref, submitLabel = "Aplicar", tabs }: FilterBarProps) {
  return (
    <div className={styles.bar}>
      {tabs}
      <form method="get" action={action} role="search" aria-label={label} className={styles.form}>
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
        {search && (
          <Input
            className={styles.search}
            type="search"
            name={search.name ?? "q"}
            label={search.label ?? "Buscar"}
            labelHidden
            placeholder={search.placeholder}
            defaultValue={search.defaultValue}
            prefix={<SearchIcon />}
          />
        )}
        {filters && <div className={styles.filters}>{filters}</div>}
        <div className={styles.actions}>
          <Button type="submit">{submitLabel}</Button>
          {clearHref && (
            <Link href={clearHref} className={styles.clear}>
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
