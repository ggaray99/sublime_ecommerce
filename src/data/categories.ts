export type CategoryId = "stickers" | "packs" | "indumentaria" | "dtf" | "vinilos" | "personalizados";

export type Category = {
  id: CategoryId;
  label: string;
  /** Short line used on cards. */
  tagline: string;
  /** Longer copy for the category listing page. */
  description: string;
  image: string;
};

export const categories: Category[] = [
  {
    id: "stickers",
    label: "Calcos y stickers",
    tagline: "Troquelados con borde blanco para pegar donde quieras.",
    description:
      "Calcos individuales con personajes y gráficas originales: criaturas, autos, fútbol de barrio, música y cultura gamer. Pensados para laptops, botellas, cuadernos y cascos.",
    image: "/demo/categories/stickers.webp",
  },
  {
    id: "packs",
    label: "Packs",
    tagline: "Selecciones temáticas de varias piezas.",
    description:
      "Combinaciones de stickers agrupados por temática. Una forma de probar varios diseños de una sola vez y armar tu propia composición.",
    image: "/demo/categories/packs.webp",
  },
  {
    id: "indumentaria",
    label: "Indumentaria",
    tagline: "Remeras con estampas gráficas.",
    description:
      "Remeras negras y claras con estampas originales de la marca. Los talles, telas y técnicas de estampado definitivos todavía están por confirmarse.",
    image: "/demo/categories/indumentaria.webp",
  },
  {
    id: "dtf",
    label: "DTF",
    tagline: "Planchas listas para transferir.",
    description:
      "Planchas con varios diseños dispuestos para impresión por transferencia (DTF). En esta demo se muestran como referencia visual.",
    image: "/demo/categories/dtf.webp",
  },
  {
    id: "vinilos",
    label: "Vinilos",
    tagline: "Decoración y kits para objetos.",
    description:
      "Vinilos decorativos para paredes y kits de calcos para laptops, cascos y otros objetos. Las medidas reales se definirán junto con el catálogo comercial.",
    image: "/demo/categories/vinilos.webp",
  },
  {
    id: "personalizados",
    label: "Personalizados",
    tagline: "Tu idea, tu formato, tu cantidad.",
    description:
      "Stickers, etiquetas y prendas hechas a partir de tu diseño o referencia. Se cotizan a pedido: en esta demo, el formulario es solo una simulación.",
    image: "/demo/categories/personalizados.webp",
  },
];

export const categoryById = (id: string): Category | undefined => categories.find((category) => category.id === id);

export const isCategoryId = (value: string): value is CategoryId => categories.some((category) => category.id === value);
