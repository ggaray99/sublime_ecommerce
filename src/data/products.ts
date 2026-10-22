import type { CategoryId } from "./categories";

export type ThemeId =
  | "anime"
  | "futbol"
  | "gaming"
  | "motor"
  | "musica"
  | "grafico"
  | "espacio"
  | "argentina"
  | "naturaleza"
  | "aventura";

export type ProductImage = { src: string; alt: string };

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CategoryId;
  theme: ThemeId;
  /** Illustrative price in ARS. `null` means the product is quoted on request. */
  price: number | null;
  images: ProductImage[];
  tags: string[];
  featured: boolean;
  isDemo: true;
  availableForDirectPurchase: boolean;
  requiresQuote: boolean;
  /** Material and usage notes. Illustrative until the business confirms them. */
  details: string[];
  /** Ordering code from the client's printed sticker catalog, when the product comes from it. */
  code?: string;
};

export const themes: Record<ThemeId, string> = {
  anime: "Anime y personajes",
  futbol: "Fútbol",
  gaming: "Gaming y sci-fi",
  motor: "Autos y motos",
  musica: "Música y skate",
  grafico: "Gráfico y urbano",
  espacio: "Espacio",
  argentina: "Argentina y Mendoza",
  naturaleza: "Flores y naturaleza",
  aventura: "Aventura y viajes",
};

const gallery = (slug: string, alts: string[]): ProductImage[] =>
  alts.map((alt, index) => ({ src: `/demo/products/${slug}-${index + 1}.webp`, alt }));

const stickerDetails = [
  "Material de referencia: vinilo adhesivo con laminado (a confirmar).",
  "Uso sugerido: laptops, botellas, cuadernos y superficies lisas.",
  "Medidas finales a definir con el catálogo comercial.",
];

const packDetails = [
  "Incluye varias piezas troqueladas de la misma temática.",
  "Cantidad y tamaño de cada pieza a confirmar.",
  "Uso sugerido: laptops, botellas, cuadernos y packaging.",
];

const shirtDetails = [
  "Técnica de estampado, tela y talles a confirmar.",
  "La imagen es una representación digital, no una fotografía del producto.",
  "Cuidados de lavado a definir según el material final.",
];

const dtfDetails = [
  "Plancha de transferencia con varios diseños dispuestos.",
  "Tamaño de plancha y requisitos de planchado a confirmar.",
  "Archivo de muestra: no apto para producción.",
];

const vinylDetails = [
  "Vinilo adhesivo de corte (material de referencia, a confirmar).",
  "Superficies sugeridas: paredes lisas, cascos, laptops y objetos rígidos.",
  "Medidas e instrucciones de aplicación a definir.",
];

const customDetails = [
  "Formato, material y cantidad se definen en cada pedido.",
  "El valor se calcula a partir de tu idea: no hay precio fijo.",
  "En esta demo, la solicitud es una simulación local.",
];

/** Original demo products with generated mockups (packs, apparel, DTF, vinyl, custom). */
const demoProducts: Product[] = [
  {
    id: "p08",
    slug: "pack-caos-grafico",
    name: "Pack Caos Gráfico",
    description: "Ocho piezas para llenar cualquier superficie: ojo, rayo, llama, smile mutante y más gráficas de la casa.",
    category: "packs",
    theme: "grafico",
    price: 8900,
    images: gallery("pack-caos-grafico", ["Pack de ocho stickers gráficos en su sobre", "Stickers del Pack Caos Gráfico distribuidos sobre una superficie"]),
    tags: ["pack", "gráfico", "urbano"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: packDetails,
  },
  {
    id: "p09",
    slug: "pack-tribuna",
    name: "Pack Tribuna",
    description: "Pelota, bufanda, camiseta 10, copa y frases de cancha. Sin escudos oficiales: pura tribuna genérica.",
    category: "packs",
    theme: "futbol",
    price: 7200,
    images: gallery("pack-tribuna", ["Pack de stickers de fútbol en su sobre violeta", "Stickers del Pack Tribuna distribuidos sobre una superficie oscura"]),
    tags: ["fútbol", "pack", "tribuna"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: packDetails,
  },
  {
    id: "p10",
    slug: "pack-pixel-punk",
    name: "Pack Pixel Punk",
    description: "Criatura pixelada, joystick, robot, ovni y corazón de 8 bits. Seis piezas para tu setup.",
    category: "packs",
    theme: "gaming",
    price: 6800,
    images: gallery("pack-pixel-punk", ["Pack de stickers gamer en su sobre", "Stickers del Pack Pixel Punk distribuidos sobre una superficie"]),
    tags: ["gaming", "pixel", "pack"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: packDetails,
  },
  {
    id: "p11",
    slug: "pack-garage",
    name: "Pack Garage",
    description: "Auto, casco, llama, rayo y frases de ruta. Seis calcos para cascos, motos y cajas de herramientas.",
    category: "packs",
    theme: "motor",
    price: 7400,
    images: gallery("pack-garage", ["Pack de stickers de autos y motos en su sobre", "Calco del Pack Garage aplicado en un casco"]),
    tags: ["motos", "autos", "pack"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: packDetails,
  },
  {
    id: "p12",
    slug: "pack-kawaii-kaos",
    name: "Pack Kawaii Kaos",
    description: "Personajes tiernos con mala actitud: ronin, onigiri, cometa, gato mutante y cohete.",
    category: "packs",
    theme: "anime",
    price: 7600,
    images: gallery("pack-kawaii-kaos", ["Pack de stickers kawaii en su sobre", "Stickers del Pack Kawaii Kaos distribuidos sobre una superficie violeta"]),
    tags: ["anime", "kawaii", "pack"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: packDetails,
  },
  {
    id: "p13",
    slug: "remera-ruido-visual",
    name: "Remera Ruido Visual",
    description: "Remera negra con ojo gráfico y la frase Ruido Visual en verde ácido.",
    category: "indumentaria",
    theme: "grafico",
    price: 18500,
    images: gallery("remera-ruido-visual", ["Remera negra con estampa de un ojo y la frase Ruido Visual", "Detalle de la estampa Ruido Visual"]),
    tags: ["remera", "streetwear", "negra"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: shirtDetails,
  },
  {
    id: "p14",
    slug: "remera-otro-planeta",
    name: "Remera Otro Planeta",
    description: "Remera clara con planeta violeta, anillo ácido y estrellas. Para los que vienen de lejos.",
    category: "indumentaria",
    theme: "espacio",
    price: 18900,
    images: gallery("remera-otro-planeta", ["Remera blanca con estampa de un planeta y la frase Otro Planeta", "Detalle de la estampa Otro Planeta"]),
    tags: ["remera", "espacio", "blanca"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: shirtDetails,
  },
  {
    id: "p15",
    slug: "remera-gato-mutante",
    name: "Remera Gato Mutante",
    description: "El Gato Mutante en gran formato sobre remera negra, con la palabra Mutante debajo.",
    category: "indumentaria",
    theme: "anime",
    price: 19500,
    images: gallery("remera-gato-mutante", ["Remera negra con estampa de un gato verde y la palabra Mutante", "Detalle de la estampa Gato Mutante"]),
    tags: ["remera", "personajes", "negra"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: shirtDetails,
  },
  {
    id: "p16",
    slug: "plancha-dtf-laboratorio",
    name: "Plancha DTF Laboratorio",
    description: "Doce diseños de la casa dispuestos en una plancha de transferencia: criaturas, cohetes, ovnis y más.",
    category: "dtf",
    theme: "espacio",
    price: 12400,
    images: gallery("plancha-dtf-laboratorio", ["Plancha DTF con doce diseños sobre film transparente", "Detalle de los diseños de la Plancha DTF Laboratorio"]),
    tags: ["transfer", "impresión", "plancha"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: dtfDetails,
  },
  {
    id: "p17",
    slug: "plancha-dtf-nocturna",
    name: "Plancha DTF Nocturna",
    description: "Autos, cascos, fútbol, gaming y personajes en una plancha de doce diseños para prendas oscuras.",
    category: "dtf",
    theme: "motor",
    price: 13200,
    images: gallery("plancha-dtf-nocturna", ["Plancha DTF con doce diseños nocturnos", "Detalle de los diseños de la Plancha DTF Nocturna"]),
    tags: ["transfer", "impresión", "noche"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: dtfDetails,
  },
  {
    id: "p18",
    slug: "vinilo-modular",
    name: "Vinilo Modular",
    description: "Composición geométrica de círculos, triángulos y bloques para transformar una pared lisa.",
    category: "vinilos",
    theme: "grafico",
    price: 9800,
    images: gallery("vinilo-modular", ["Vinilo decorativo geométrico aplicado en la pared de un living"]),
    tags: ["decoración", "pared", "geométrico"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: vinylDetails,
  },
  {
    id: "p19",
    slug: "kit-vinilos-laptop",
    name: "Kit Vinilos Laptop",
    description: "Cohete, planeta, corazón pixelado y frases cortas en una plancha pensada para la tapa de tu notebook.",
    category: "vinilos",
    theme: "espacio",
    price: 5900,
    images: gallery("kit-vinilos-laptop", ["Vinilos de un cohete y un planeta aplicados en una laptop", "Plancha con los vinilos del Kit Laptop"]),
    tags: ["laptop", "kit", "espacio"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: vinylDetails,
  },
  {
    id: "p20",
    slug: "kit-vinilos-casco",
    name: "Kit Vinilos Casco",
    description: "Placa Ruta 00, llamas, rayos y casco en miniatura para personalizar tu casco o tu moto.",
    category: "vinilos",
    theme: "motor",
    price: 6400,
    images: gallery("kit-vinilos-casco", ["Vinilo Ruta 00 aplicado en un casco", "Plancha con los vinilos del Kit Casco"]),
    tags: ["casco", "motos", "kit"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: true,
    requiresQuote: false,
    details: vinylDetails,
  },
  {
    id: "p21",
    slug: "stickers-a-medida",
    name: "Stickers a medida",
    description: "Llevá tu dibujo, logo o boceto a un sticker troquelado. Elegís formato y cantidad aproximada.",
    category: "personalizados",
    theme: "grafico",
    price: null,
    images: gallery("stickers-a-medida", ["Ejemplo de un boceto convertido en sticker troquelado", "Stickers personalizados aplicados en una tabla de skate"]),
    tags: ["a medida", "logo", "presupuesto"],
    featured: true,
    isDemo: true,
    availableForDirectPurchase: false,
    requiresQuote: true,
    details: customDetails,
  },
  {
    id: "p22",
    slug: "etiquetas-para-tu-marca",
    name: "Etiquetas para tu marca",
    description: "Etiquetas para packaging, frascos y envíos con tu logo. Ideal para emprendimientos.",
    category: "personalizados",
    theme: "grafico",
    price: null,
    images: gallery("etiquetas-para-tu-marca", ["Plancha de etiquetas redondas con espacio para tu marca", "Caja de envío con etiquetas y calcos aplicados"]),
    tags: ["etiquetas", "packaging", "emprendimientos"],
    featured: false,
    isDemo: true,
    availableForDirectPurchase: false,
    requiresQuote: true,
    details: customDetails,
  },
];

/**
 * Selection of 50 stickers from the client's sticker catalog (PDF), loaded as a
 * test. Designs with third-party brands, licensed characters, club crests or
 * real people were left out. Prices are illustrative, like the rest of the demo.
 * Images are the catalog's 300 px originals: replace with high-resolution files.
 */
type CatalogSection = { theme: ThemeId; tags: string[] };

const catalogSections: Record<string, CatalogSection> = {
  argentina: { theme: "argentina", tags: ["argentina", "mate"] },
  aventura: { theme: "aventura", tags: ["aventura", "viajes"] },
  flores: { theme: "naturaleza", tags: ["flores", "naturaleza"] },
  random: { theme: "grafico", tags: ["random", "personajes"] },
  mendoza: { theme: "argentina", tags: ["mendoza", "argentina"] },
};

const CATALOG_STICKER_PRICE = 1800;

/** Catalog stickers highlighted on the home page. */
const featuredCatalogCodes = new Set(["088", "137", "044", "159", "146", "075"]);

const catalogStickerList: [code: string, name: string, section: keyof typeof catalogSections][] = [
  ["038", "Mano con mate", "argentina"],
  ["039", "Tomá mate", "argentina"],
  ["040", "Empanada", "argentina"],
  ["041", "I love Argentina", "argentina"],
  ["042", "Sol de Mayo", "argentina"],
  ["043", "Love mate", "argentina"],
  ["044", "Mate con bombilla", "argentina"],
  ["047", "Ruta 40", "argentina"],
  ["050", "Código Argentina", "argentina"],
  ["051", "Bandera argentina", "argentina"],
  ["073", "Good vibes", "aventura"],
  ["074", "Fogón", "aventura"],
  ["075", "Say yes to adventure", "aventura"],
  ["076", "Explore", "aventura"],
  ["077", "Go wild", "aventura"],
  ["078", "Combi en el bosque", "aventura"],
  ["080", "Mochila de viaje", "aventura"],
  ["081", "Cerro nevado", "aventura"],
  ["082", "Gerbera fucsia", "flores"],
  ["084", "Margarita azul", "flores"],
  ["085", "Rosa roja", "flores"],
  ["086", "Flor rosa", "flores"],
  ["087", "Margarita blanca", "flores"],
  ["088", "Girasol", "flores"],
  ["089", "Lavanda", "flores"],
  ["090", "Mariposa azul", "flores"],
  ["091", "Gatito entre flores", "flores"],
  ["092", "Vaquita florida", "flores"],
  ["094", "Mariposas monarca", "flores"],
  ["096", "Tulipanes", "flores"],
  ["128", "Dino corazón", "random"],
  ["129", "Pancho", "random"],
  ["131", "Sol radiante", "random"],
  ["132", "Globo terráqueo", "random"],
  ["135", "Abeja vida adulta", "random"],
  ["137", "Gato de la suerte", "random"],
  ["139", "Esqueleto y gato", "random"],
  ["141", "Querubín", "random"],
  ["142", "Gatita hongo", "random"],
  ["145", "Smile derretido", "random"],
  ["146", "Ojo turco", "random"],
  ["153", "Cerezas", "random"],
  ["154", "Mendoza x6", "mendoza"],
  ["155", "Mapa de Mendoza", "mendoza"],
  ["156", "Atardecer en Mendoza", "mendoza"],
  ["157", "I love San Rafael", "mendoza"],
  ["159", "Ruta 7 Mendoza", "mendoza"],
  ["160", "Copa de vino", "mendoza"],
  ["161", "Postal de Mendoza", "mendoza"],
  ["162", "Montañas de Mendoza", "mendoza"],
];

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const catalogStickers: Product[] = catalogStickerList.map(([code, name, section]) => ({
  id: `c${code}`,
  slug: `sticker-${slugify(name)}-${code}`,
  name: `Sticker ${name}`,
  description: `Sticker del catálogo Sublime (código ${code}). Diseño troquelado para laptops, botellas y cuadernos.`,
  category: "stickers",
  theme: catalogSections[section].theme,
  price: CATALOG_STICKER_PRICE,
  images: [{ src: `/catalogo/stickers/${code}.webp`, alt: `Sticker ${name}, código ${code} del catálogo` }],
  tags: [...catalogSections[section].tags, "catálogo"],
  featured: featuredCatalogCodes.has(code),
  isDemo: true,
  availableForDirectPurchase: true,
  requiresQuote: false,
  details: stickerDetails,
  code,
}));

export const products: Product[] = [...demoProducts, ...catalogStickers];

export const productBySlug = (slug: string): Product | undefined => products.find((product) => product.slug === slug);

export const productById = (id: string): Product | undefined => products.find((product) => product.id === id);
