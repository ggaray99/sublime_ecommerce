import Link from "next/link";
import type { InfoPageContent } from "@/data/site";
import { PageIntro } from "./page-intro";

export function InfoPage({ content }: { content: InfoPageContent }) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Información" title={content.title} tone="light">
        <p>{content.intro}</p>
      </PageIntro>
      <div className="info-sections">
        {content.sections.map((section) => (
          <section key={section.title} className="info-section">
            <div className="info-section__head">
              <h2>{section.title}</h2>
              <span className={`badge ${section.status === "pendiente" ? "badge--pending" : "badge--violet"}`}>
                {section.status === "pendiente" ? "Pendiente" : "Demo"}
              </span>
            </div>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
      <p className="info-back">
        <Link className="btn btn--coal" href="/tienda">
          Ir a la tienda demo
        </Link>
      </p>
    </main>
  );
}
