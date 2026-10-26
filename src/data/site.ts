export const site = {
  name: "Sublime",
  // Public address of this deployment (same variable the sign-in uses); read on the server.
  url: process.env.BETTER_AUTH_URL ?? "https://sublimestudio.com.ar",
  description:
    "Calcos, stickers, remeras estampadas, planchas DTF, vinilos y productos personalizados con diseños originales.",
};

export type NavLink = { href: string; label: string };

export const mainNav: NavLink[] = [
  { href: "/tienda", label: "Tienda" },
  { href: "/categorias", label: "Categorías" },
  { href: "/#destacados", label: "Destacados" },
  { href: "/encargos", label: "Personalizados" },
  { href: "/puntos", label: "Dónde comprar" },
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
  status?: "pendiente";
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
    description: "Qué es Sublime: calcos, stickers y productos personalizados con diseños originales.",
    intro: "Sublime es un proyecto argentino de calcos, stickers y productos personalizados con diseños originales.",
    sections: [
      {
        title: "Qué vas a encontrar acá",
        body: "Calcos troquelados, packs de stickers, remeras estampadas, planchas DTF, vinilos y encargos a medida a partir de tu idea.",
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
    description: "Envíos y retiro de pedidos de Sublime: costos, plazos y seguimiento.",
    intro: "El costo y el plazo del envío se calculan en el checkout según tu código postal, antes de confirmar el pedido.",
    sections: [
      { title: "Zonas y costos", body: "Ingresá tu código postal en el checkout para ver si llegamos a tu zona y cuánto cuesta el envío." },
      { title: "Plazos", body: "El checkout muestra el plazo estimado de entrega para tu zona." },
      { title: "Retiro en persona", body: "Si preferís retirar, elegilo en el checkout: ahí vas a ver la dirección y el horario." },
      { title: "Seguimiento del pedido", body: "Cuando despachamos tu pedido cargamos el número de seguimiento, y lo ves en la página de tu pedido." },
    ],
  },
  preguntas: {
    slug: "preguntas",
    title: "Preguntas frecuentes",
    description: "Preguntas frecuentes sobre compras, encargos y envíos en Sublime.",
    intro: "Lo que más nos preguntan sobre cómo comprar en Sublime.",
    sections: [
      {
        title: "¿Cómo compro?",
        body: "Sumá productos al carrito y confirmá el pedido en el checkout. Reservamos el stock y te escribimos para coordinar el pago.",
      },
      {
        title: "¿Puedo pedir un diseño personalizado?",
        body: "Sí. Completá el formulario de encargos con tu idea y te respondemos con un presupuesto.",
      },
      { title: "¿Qué medios de pago van a aceptar?", body: "A definir.", status: "pendiente" },
      { title: "¿Hacen ventas mayoristas?", body: "A definir.", status: "pendiente" },
    ],
  },
  politicas: {
    slug: "politicas",
    title: "Políticas",
    description: "Políticas comerciales y de privacidad de Sublime.",
    intro: "Estas políticas se están terminando de definir.",
    sections: [
      { title: "Privacidad", body: "A definir.", status: "pendiente" },
      { title: "Cambios y devoluciones", body: "A definir.", status: "pendiente" },
      { title: "Medios de pago y cuotas", body: "A definir.", status: "pendiente" },
      { title: "Términos y condiciones", body: "A definir.", status: "pendiente" },
      { title: "Defensa del consumidor", body: "A definir.", status: "pendiente" },
    ],
  },
};
