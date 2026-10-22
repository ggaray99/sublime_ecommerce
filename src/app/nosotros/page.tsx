import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { infoPages } from "@/data/site";

const content = infoPages.nosotros;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/nosotros" },
};

export default function NosotrosPage() {
  return <InfoPage content={content} />;
}
