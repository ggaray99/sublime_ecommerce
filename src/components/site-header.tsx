import Link from "next/link";
import { mainNav } from "@/data/site";
import { accountsAvailable } from "@/server/customers/session";
import { BrandLogo } from "./brand-logo";
import { CartLink } from "./cart/cart-link";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  // The account link only appears where customer accounts are enabled.
  const links = accountsAvailable() ? [...mainNav, { href: "/cuenta", label: "Mi cuenta" }] : mainNav;
  // Only the staging build shows this bar (read at build time); the store never does.
  const staging = process.env.SUBLIME_ENV === "staging";
  return (
    <>
      {staging && (
        <p className="demo-bar">
          <strong>Entorno de prueba</strong> · Los pedidos de este sitio no se cobran ni se envían
        </p>
      )}
      <header className="site-header">
        <BrandLogo />
        <nav className="site-nav" aria-label="Principal">
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header__actions">
          <CartLink />
          <MobileNav links={links} />
        </div>
      </header>
    </>
  );
}
