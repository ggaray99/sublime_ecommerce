import Link from "next/link";
import { infoNav, mainNav } from "@/data/site";
import { contactItems } from "@/server/settings/contact";
import { getContactSettings } from "@/server/settings/session";
import { getStorefrontCategories } from "@/server/storefront";
import { BrandLogo } from "./brand-logo";

export async function SiteFooter() {
  const [categories, contact] = await Promise.all([getStorefrontCategories(), getContactSettings()]);
  const items = contactItems(contact);
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <BrandLogo className="brand-logo--footer" />
        <p>Calcos, stickers y productos personalizados con diseños originales.</p>
      </div>
      <nav aria-labelledby="footer-nav-shop">
        <h2 id="footer-nav-shop">Tienda</h2>
        <ul>
          {mainNav.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
          <li>
            <Link href="/carrito">Carrito</Link>
          </li>
        </ul>
      </nav>
      <nav aria-labelledby="footer-nav-categories">
        <h2 id="footer-nav-categories">Categorías</h2>
        <ul>
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/tienda?categoria=${category.id}`}>{category.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-labelledby="footer-nav-info">
        <h2 id="footer-nav-info">Información</h2>
        <ul>
          {infoNav.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="footer-contact">
        <h2 id="footer-contact">Contacto</h2>
        {items.length ? (
          <dl className="site-footer__contact">
            {items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  {item.href ? (
                    <a href={item.href} {...(item.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      {item.value}
                    </a>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Datos de contacto pendientes de confirmación.</p>
        )}
      </section>
      <p className="site-footer__legal">© Sublime. Precios en pesos argentinos.</p>
    </footer>
  );
}
