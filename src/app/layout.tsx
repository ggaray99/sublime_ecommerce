import type { Metadata, Viewport } from "next";
import { Bebas_Neue } from "next/font/google";
import localFont from "next/font/local";
import { CartToast } from "@/components/cart/cart-toast";
import { PreviewBar } from "@/components/preview-bar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/data/site";
import "./globals.css";

/* Brand typography (client branding kit):
   Bebas Neue — primary: titles, highlighted numbers, promotional buttons.
   Gontserrat — secondary: product names, prices, forms, buttons and states.
   Gontserrat is OFL licensed; the files are latin subsets of the kit's TTFs.
   Only the weights the CSS uses (400, 600, 700, 800) are loaded. */
const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

const gontserrat = localFont({
  src: [
    { path: "../fonts/gontserrat/Gontserrat-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/gontserrat/Gontserrat-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/gontserrat/Gontserrat-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/gontserrat/Gontserrat-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-gontserrat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Sublime — Calcos, stickers y productos personalizados",
    template: "%s | Sublime",
  },
  description: site.description,
  applicationName: "Sublime",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Sublime",
    title: "Sublime — Pegá tu identidad",
    description: site.description,
    url: "/",
  },
  // Kept out of search results until launch (real catalog, prices and policies).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${bebas.variable} ${gontserrat.variable}`}>
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <PreviewBar />
        <SiteHeader />
        {children}
        <SiteFooter />
        <CartToast />
      </body>
    </html>
  );
}
