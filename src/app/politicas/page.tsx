import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { infoPages } from "@/data/site";

const content = infoPages.politicas;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/politicas" },
};

export default function PoliticasPage() {
  return <InfoPage content={content} />;
}
