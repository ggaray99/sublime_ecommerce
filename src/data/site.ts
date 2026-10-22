export const site = {
  name: "Sublime",
  url: "https://sublime-ecommerce.vercel.app",
  description:
    "Tienda demo de calcos, stickers, remeras estampadas, planchas DTF, vinilos y productos personalizados. Productos y precios ficticios, sin compras reales.",
};

export type NavLink = { href: string; label: string };

export const mainNav: NavLink[] = [
  { href: "/tienda", label: "Tienda" },
  { href: "/categorias", label: "Categorías" },
  { href: "/#destacados", label: "Destacados" },
  { href: "/encargos", label: "Personalizados" },
];

export const infoNav: NavLink[] = [
  { href: "/nosotros", label: "Sobre Sublime" },
  { href: "/envios", label: "Envíos" },
  { href: "/preguntas", label: "Preguntas frecuentes" },
  { href: "/politicas", label: "Políticas" },
];

/** Contact data is not confirmed yet: every value is an explicit placeholder. */
export const contact: { label: string; value: string }[] = [
  { label: "Email", value: "Pendiente de confirmación" },
  { label: "WhatsApp", value: "Pendiente de confirmación" },
  { label: "Redes sociales", value: "Pendientes de confirmación" },
  { label: "Ubicación", value: "Pendiente de confirmación" },
];

export type InfoSection = {
  title: string;
  body: string;
  /** `pendiente` marks commercial information the business still has to define. */
  status: "pendiente" | "demo";
};

export type InfoPageContent = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: InfoSection[];
};

/**
 * Editable structure for the informational pages. Replace each `pendiente`
 * section with the confirmed policy text before launching real sales.
 */
export const infoPages: Record<"nosotros" | "envios" | "preguntas" | "politicas", InfoPageContent> = {
  nosotros: {
    slug: "nosotros",
    title: "Sobre Sublime",
    description: "Qué es Sublime y en qué etapa está este proyecto de ecommerce demo.",
    intro:
      "Sublime es un proyecto argentino de calcos, stickers y productos personalizados. Este sitio es un laboratorio: sirve para probar cómo se sentiría comprar en la marca antes de tener un catálogo comercial definitivo.",
    sections: [
      {
        title: "Qué vas a encontrar acá",
        body: "Un catálogo de productos ficticios con diseños originales, un carrito de prueba y un formulario de encargos que funciona solo en tu navegador.",
        status: "demo",
      },
      {
        title: "Historia y equipo",
        body: "La presentación de la marca, el equipo y el taller se incorporarán cuando estén confirmados.",
        status: "pendiente",
      },
    ],
  },
  envios: {
    slug: "envios",
    title: "Envíos",
    description: "Información de envíos de Sublime: pendiente de definición.",
    intro: "Todavía no hay envíos habilitados. Esta página reúne la estructura que se va a completar cuando se definan las condiciones reales.",
    sections: [
      { title: "Zonas de cobertura", body: "A definir.", status: "pendiente" },
      { title: "Costos y plazos", body: "A definir. No se informan plazos estimados hasta contar con datos confirmados.", status: "pendiente" },
      { title: "Retiro en persona", body: "A definir.", status: "pendiente" },
      { title: "Seguimiento del pedido", body: "A definir.", status: "pendiente" },
    ],
  },
  preguntas: {
    slug: "preguntas",
    title: "Preguntas frecuentes",
    description: "Respuestas sobre el funcionamiento de la tienda demo de Sublime.",
    intro: "Algunas respuestas son definitivas para esta demo; otras dependen de decisiones comerciales todavía abiertas.",
    sections: [
      {
        title: "¿Puedo comprar en este sitio?",
        body: "No. Es una demostración: el carrito funciona en tu navegador, pero ningún pedido se envía ni se cobra.",
        status: "demo",
      },
      {
        title: "¿Los precios son reales?",
        body: "No. Son valores ilustrativos para probar la experiencia y pueden no tener relación con los precios finales.",
        status: "demo",
      },
      {
        title: "¿Puedo pedir un diseño personalizado?",
        body: "Podés completar el formulario de encargos para ver cómo funcionaría. La solicitud no se envía a ningún negocio.",
        status: "demo",
      },
      { title: "¿Qué medios de pago van a aceptar?", body: "A definir.", status: "pendiente" },
      { title: "¿Hacen ventas mayoristas?", body: "A definir.", status: "pendiente" },
    ],
  },
  politicas: {
    slug: "politicas",
    title: "Políticas",
    description: "Estructura de políticas comerciales y de privacidad de Sublime, pendientes de confirmación.",
    intro: "Ninguna política comercial está vigente todavía. Estas secciones quedan listas para completar con textos revisados.",
    sections: [
      {
        title: "Privacidad en esta demo",
        body: "Este sitio no envía tus datos a ningún servidor. El carrito demo guarda solo identificadores de producto y cantidades en el almacenamiento local de tu navegador, y el formulario de encargos no guarda ni envía lo que escribas.",
        status: "demo",
      },
      { title: "Cambios y devoluciones", body: "A definir.", status: "pendiente" },
      { title: "Medios de pago y cuotas", body: "A definir.", status: "pendiente" },
      { title: "Términos y condiciones", body: "A definir.", status: "pendiente" },
      { title: "Defensa del consumidor", body: "A definir.", status: "pendiente" },
    ],
  },
};
