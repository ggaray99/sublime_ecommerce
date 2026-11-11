import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { infoPages } from "@/data/site";
import { getInfoPage } from "@/server/settings/session";

const content = infoPages.envios;

export const metadata: Metadata = {
  title: content.title,
  description: content.description,
  alternates: { canonical: "/envios" },
};

export default async function EnviosPage() {
  return <InfoPage content={await getInfoPage("envios")} />;
}
