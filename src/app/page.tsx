import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getHomeHero } from "@/server/home/session";
import { pickHeroProducts } from "@/server/home/settings";
import { getStorefrontCategories, getStorefrontProducts } from "@/server/storefront";
import { priceLabel } from "@/lib/format";

const applications = [
  { src: "/demo/editorial/laptop.webp", label: "Laptops", alt: "Stickers pegados en una laptop" },
  { src: "/demo/editorial/botella.webp", label: "Botellas", alt: "Calcos en una botella térmica" },
  { src: "/demo/editorial/casco.webp", label: "Cascos", alt: "Calco aplicado en un casco" },
  { src: "/demo/editorial/packaging.webp", label: "Packaging", alt: "Caja de envío con calcos" },
  { src: "/demo/editorial/remera.webp", label: "Remeras", alt: "Remera clara con estampa" },
];

const ticker = ["Calcos troquelados", "Packs", "Remeras", "Planchas DTF", "Vinilos", "Encargos a medida"];

const processTracks = [
  {
    title: "Productos estándar",
    note: "Calcos, packs, remeras, DTF y vinilos del catálogo.",
    steps: ["Elegí tus diseños en la tienda.", "Sumalos al carrito y ajustá cantidades.", "Confirmá el pedido: coordinamos el pago y la entrega."],
  },
  {
    title: "Personalizados",
    note: "Stickers, etiquetas y prendas a partir de tu idea.",
    steps: [
      "Contanos qué querés, en qué formato y cuántos.",
      "Te respondemos con un presupuesto: valores y tiempos.",
      "Aprobás el presupuesto y lo producimos.",
    ],
  },
];

export default async function Home() {
  const [products, categories, hero] = await Promise.all([getStorefrontProducts(), getStorefrontCategories(), getHomeHero()]);
  // Edited from /admin/portada; hidden or missing products fall back to the usual ones.
  const heroProducts = pickHeroProducts(hero, products);
  // Featured mix: catalog stickers first, then the rest of the product lines.
  const featured = [
    ...products.filter((product) => product.featured && product.code).slice(0, 4),
    ...products.filter((product) => product.featured && !product.code).slice(0, 4),
  ];

  return (
    <main id="contenido">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          {hero.kicker && <p className="kicker">{hero.kicker}</p>}
          <h1 id="hero-title">
            {hero.titleLine1}
            {hero.titleLine1 && hero.titleLine2 && <br />}
            {hero.titleLine2 && <em>{hero.titleLine2}</em>}
          </h1>
          {hero.lede && <p className="hero__lede">{hero.lede}</p>}
          <div className="actions">
            <Link className="btn btn--acid btn--lg" href={hero.primaryHref}>
              {hero.primaryLabel}
            </Link>
            {hero.secondaryLabel && (
              <Link className="btn btn--ghost-light btn--lg" href={hero.secondaryHref}>
                {hero.secondaryLabel}
              </Link>
            )}
          </div>
        </div>

        <div className="hero__stage">
          {heroProducts.map((product, index) => (
            <Link key={product.id} href={`/producto/${product.slug}`} className={`hero__item hero__item--${index + 1}`}>
              <Image
                src={product.images[0].src}
                alt={product.images[0].alt}
                width={800}
                height={800}
                sizes="(max-width: 899px) 60vw, 28vw"
                preload={index === 0}
              />
              <span className="hero__label">
                {product.name} <b>{priceLabel(product.price)}</b>
              </span>
            </Link>
          ))}
          {hero.stamp && (
            <span className="hero__stamp" aria-hidden="true">
              {hero.stamp}
            </span>
          )}
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker__track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              {ticker.map((item) => (
                <span key={item}>{item} ✦ </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section id="categorias" className="section section--cement" aria-labelledby="categorias-title">
        <div className="section__head">
          <div>
            <p className="kicker">Explorá por formato</p>
            <h2 id="categorias-title">
              HACÉ ESPACIO
              <br />
              PARA TU IDEA.
            </h2>
          </div>
          <Link className="btn btn--coal" href="/categorias">
            Todas las categorías
          </Link>
        </div>
        <ul className="category-grid">
          {categories.map((category, index) => (
            <li key={category.id}>
              <Link href={`/tienda?categoria=${category.id}`} className="category-card">
                <span className="category-card__media">
                  <Image src={category.image} alt="" width={800} height={800} sizes="(max-width: 559px) 100vw, (max-width: 1023px) 50vw, 33vw" />
                </span>
                <span className="category-card__body">
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <strong>{category.label}</strong>
                  <span>{category.tagline}</span>
                </span>
                <span className="category-card__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="destacados" className="section section--coal" aria-labelledby="destacados-title">
        <div className="section__head">
          <div>
            <p className="kicker">Destacados</p>
            <h2 id="destacados-title">
              LO QUE PODÉS
              <br />
              <em>PEGAR HOY.</em>
            </h2>
          </div>
          <Link className="btn btn--acid" href="/tienda">
            Ver catálogo completo
          </Link>
        </div>
        <p className="price-note">Precios en pesos argentinos.</p>
        <ul className="product-grid">
          {featured.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </section>

      <section className="section section--paper editorial" aria-labelledby="editorial-title">
        <div className="editorial__intro">
          <p className="kicker">Identidad gráfica</p>
          <h2 id="editorial-title">
            PEGALO
            <br />
            <em>EN TODO.</em>
          </h2>
          <p>
            Cada diseño está pensado para vivir fuera de la pantalla: en la botella de todos los días, la tapa de la
            notebook, el casco o la caja de un envío.
          </p>
        </div>
        <ul className="editorial__grid">
          {applications.map((item, index) => (
            <li key={item.src} className={`editorial__item editorial__item--${index + 1}`}>
              <figure>
                <Image src={item.src} alt={item.alt} width={800} height={800} sizes="(max-width: 767px) 50vw, 30vw" />
                <figcaption>{item.label}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <section className="section section--plum custom-cta" aria-labelledby="custom-title">
        <div>
          <p className="kicker">Sin plantilla</p>
          <h2 id="custom-title">
            ¿TU IDEA NO
            <br />
            ENTRA EN UN
            <br />
            <em>CUADRADO?</em>
          </h2>
          <p>
            Stickers con tu dibujo, etiquetas para tu emprendimiento, remeras para tu banda. Contanos el producto, la
            cantidad aproximada y el formato que imaginás.
          </p>
          <ul className="check-list">
            <li>Cualquier forma de troquel</li>
            <li>Cantidades chicas o grandes</li>
            <li>Referencias en texto o archivo</li>
          </ul>
          <Link className="btn btn--acid btn--lg" href="/encargos">
            Pedir un encargo
          </Link>
        </div>
        <div className="custom-cta__art">
          <Image
            src="/demo/products/stickers-a-medida-1.webp"
            alt="Ejemplo de un boceto convertido en sticker troquelado"
            width={800}
            height={800}
            sizes="(max-width: 899px) 90vw, 40vw"
          />
        </div>
      </section>

      <section className="section section--cement" aria-labelledby="proceso-title">
        <p className="kicker">Cómo funciona</p>
        <h2 id="proceso-title">DOS CAMINOS.</h2>
        <div className="process">
          {processTracks.map((track) => (
            <div key={track.title} className="process__track">
              <h3>{track.title}</h3>
              <p>{track.note}</p>
              <ol>
                {track.steps.map((step, index) => (
                  <li key={step}>
                    <span>0{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
