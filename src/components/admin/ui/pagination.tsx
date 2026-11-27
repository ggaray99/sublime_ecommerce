import Link from "next/link";
import { cx } from "./class-names.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { pageHref, paginationState, type SearchParamsRecord } from "./pagination-links.ts";
import styles from "./pagination.module.css";

export type PaginationProps = {
  page: number;
  pageSize: number;
  /** Total rows, when the list counts them ("51–100 de 120"). */
  total?: number;
  /** Without a total: whether another page follows. */
  hasNext?: boolean;
  /** List URL and its current search params; other filters are kept. */
  baseHref: string;
  searchParams?: SearchParamsRecord;
  /** Page parameter; the admin lists use "pagina". */
  param?: string;
  /** Cursor lists (e.g. Actividad) can pass their own links instead. */
  previousHref?: string;
  nextHref?: string;
};

/** Previous/next links with the page position, inside <nav aria-label="Paginación">. */
export function Pagination({ page, pageSize, total, hasNext, baseHref, searchParams = {}, param = "pagina", previousHref, nextHref }: PaginationProps) {
  const state = paginationState({ page, pageSize, total, hasNext });
  const previous = previousHref ?? (state.hasPrevious ? pageHref(baseHref, searchParams, state.page - 1, param) : undefined);
  const next = nextHref ?? (state.hasNext ? pageHref(baseHref, searchParams, state.page + 1, param) : undefined);
  const position = state.pageCount ? `Página ${state.page} de ${state.pageCount}` : `Página ${state.page}`;
  const range = state.total !== undefined && state.total > 0 ? `${state.from}–${state.to} de ${state.total}` : undefined;

  return (
    <nav aria-label="Paginación" className={styles.nav}>
      <PageLink href={previous} direction="previous" />
      <p className={styles.info}>
        <span>{position}</span>
        {range && <span className={styles.range}>{range}</span>}
      </p>
      <PageLink href={next} direction="next" />
    </nav>
  );
}

function PageLink({ href, direction }: { href: string | undefined; direction: "previous" | "next" }) {
  const label = direction === "previous" ? "Anterior" : "Siguiente";
  const icon = direction === "previous" ? <ChevronLeftIcon /> : <ChevronRightIcon />;
  const content = (
    <>
      {direction === "previous" && icon}
      <span>{label}</span>
      {direction === "next" && icon}
    </>
  );
  if (!href) {
    // Not a link at the ends: nothing to focus, still visible for orientation.
    return (
      <span className={cx(styles.link, styles.disabled)} aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={styles.link} rel={direction === "previous" ? "prev" : "next"}>
      {content}
    </Link>
  );
}
