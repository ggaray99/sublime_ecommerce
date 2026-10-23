import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { categories } from "@/data/categories";
import { getStorefrontProducts } from "@/server/storefront";
import { priceLabel } from "@/lib/format";

const heroSlugs = ["pack-caos-grafico", "remera-ruido-visual", "sticker-gato-de-la-suerte-137"];

const applications = [
  { src: "/demo/editorial/laptop.webp", label: "Laptops", alt: "Stickers de demostración pegados en una laptop" },
  { src: "/demo/editorial/botella.webp", label: "Botellas", alt: "Calcos de demostración en una botella térmica" },
  { src: "/demo/editorial/casco.webp", label: "Cascos", alt: "Calco de demostración aplicado en un casco" },
  { src: "/demo/editorial/packaging.webp", label: "Packaging", alt: "Caja de envío con calcos de demostración" },
  { src: "/demo/editorial/remera.webp", label: "Remeras", alt: "Remera clara con estampa de demostración" },
];

const ticker = ["Calcos troquelados", "Packs", "Remeras", "Planchas DTF", "Vinilos", "Encargos a medida"];

const processTracks = [
  {
    title: "Productos estándar",
    note: "Calcos, packs, remeras, DTF y vinilos del catálogo.",
    steps: ["Elegí tus diseños en la tienda.", "Sumalos al carrito demo y ajustá cantidades.", "Recorré el checkout simulado: no se cobra nada."],
  },
  {
    title: "Personalizados",
    note: "Stickers, etiquetas y prendas a partir de tu idea.",
    steps: [
      "Contanos qué querés, en qué formato y cuántos.",
      "Se arma una propuesta con valores y tiempos (canal pendiente).",
      "Aprobás la propuesta y se produce (proceso a definir).",
    ],
  },
];

export default async function Home() {
  const products = await getStorefrontProducts();
  const heroProducts = heroSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product) => product !== undefined);
  // Featured mix: catalog stickers first, then the rest of the product lines.
  const featured = [
    ...products.filter((product) => product.featured && product.code).slice(0, 4),
    ...products.filter((product) => product.featured && !product.code).slice(0, 4),
  ];

  return (
    <main id="contenido">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="kicker">Stickers / DTF / Vinilos / Remeras</p>
          <h1 id="hero-title">
            PEGÁ
            <br />
            <em>TU IDENTIDAD.</em>
          </h1>
          <p className="hero__lede">
            Calcos troquelados, packs, remeras y productos a medida con diseños originales. Esta es una tienda demo: probá
            el recorrido completo sin compras reales.
          </p>
          <div className="actions">
            <Link className="btn btn--acid btn--lg" href="/tienda?categoria=stickers">
              Explorar calcos
            </Link>
            <Link className="btn btn--ghost-light btn--lg" href="/encargos">
              Ver personalizados →
            </Link>
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
          <span className="hero__stamp" aria-hidden="true">
            DISEÑOS
            <br />
            ORIGINALES
          </span>
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
            <p className="kicker">Destacados demo</p>
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
        <p className="price-note">Precios ilustrativos en pesos argentinos. No hay stock ni ventas reales.</p>
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
            notebook, el casco o la caja de un envío. Mockups digitales de demostración; la fotografía real llegará con el
            catálogo definitivo.
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
            Simular un encargo
          </Link>
          <p className="fine-print">El formulario es una demo: no envía la solicitud a ningún negocio.</p>
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
        <p className="fine-print">En esta demo no se procesan pedidos, pagos ni envíos.</p>
      </section>
    </main>
  );
}
