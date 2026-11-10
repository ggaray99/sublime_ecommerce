/** Product themes. Kept apart from the catalog so client code can import them without shipping every product. */
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
