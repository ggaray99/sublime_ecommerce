import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { infoPages } from "@/data/site";

const content = infoPages.preguntas;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/preguntas" },
};

export default function PreguntasPage() {
  return <InfoPage content={content} />;
}
