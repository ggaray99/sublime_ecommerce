import type { SizeGuideTable } from "@/server/designs/size-guides";
import styles from "./size-guide.module.css";

/** One kind's size guide: a disclosure with the table and its note. */
function SizeGuideDetails({ label, guide }: { label: string; guide: SizeGuideTable }) {
  const [first, ...rest] = guide.headers;
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Guía de talles · {label}</summary>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Guía de talles de {label.toLowerCase()}</caption>
          <thead>
            <tr>
              <th scope="col">{first}</th>
              {rest.map((header, index) => (
                <th key={index} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map(([head, ...cells], row) => (
              <tr key={row}>
                <th scope="row">{head}</th>
                {cells.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {guide.note && <p className={styles.note}>{guide.note}</p>}
    </details>
  );
}

/** A kind's size guide with the label it is shown under. */
export type KindSizeGuide = { label: string; guide: SizeGuideTable };

/** Size guides, each under its kind label. Renders nothing without guides. */
export function SizeGuides({ guides }: { guides: KindSizeGuide[] }) {
  if (!guides.length) return null;
  return (
    <section className={styles.section} aria-labelledby="guia-talles-title">
      <h2 id="guia-talles-title" className={styles.title}>
        Guía de talles
      </h2>
      {guides.map(({ label, guide }) => (
        <SizeGuideDetails key={label} label={label} guide={guide} />
      ))}
    </section>
  );
}
