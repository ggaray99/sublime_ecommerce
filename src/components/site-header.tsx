import Link from "next/link";
import { mainNav } from "@/data/site";
import { BrandLogo } from "./brand-logo";
import { CartLink } from "./cart/cart-link";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  return (
    <>
      <p className="demo-bar">
        <strong>Sitio demo</strong> · Productos y precios ficticios · No se realizan compras reales
      </p>
      <header className="site-header">
        <BrandLogo />
        <nav className="site-nav" aria-label="Principal">
          <ul>
            {mainNav.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header__actions">
          <CartLink />
          <MobileNav links={mainNav} />
        </div>
      </header>
    </>
  );
}
