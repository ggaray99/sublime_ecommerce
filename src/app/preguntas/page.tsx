import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { JsonLd } from "@/components/json-ld";
import { faqJsonLd } from "@/lib/structured-data";
import { infoPages } from "@/data/site";

const content = infoPages.preguntas;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/preguntas" },
};

export default function PreguntasPage() {
  return (
    <>
      <InfoPage content={content} />
      <JsonLd data={faqJsonLd(content)} />
    </>
  );
}
