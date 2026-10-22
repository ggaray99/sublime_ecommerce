import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { infoPages } from "@/data/site";

const content = infoPages.envios;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/envios" },
};

export default function EnviosPage() {
  return <InfoPage content={content} />;
}
