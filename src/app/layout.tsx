import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sublime — Productos personalizados",
  description: "Tienda demostrativa de stickers, remeras sublimadas, DTF y vinilos personalizados.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR"><body>{children}</body></html>
  );
}
