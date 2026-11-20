/**
 * Base products a design can be sold on. Shared by the browser and the server;
 * the database keeps the same list in CHECK constraints (0020_designs.sql).
 */
export const MOCKUP_KINDS = ["tshirt", "tank", "mug", "sticker"] as const;
export type MockupKind = (typeof MOCKUP_KINDS)[number];

export const MOCKUP_KIND_LABELS: Record<MockupKind, string> = {
  tshirt: "Remera",
  tank: "Musculosa",
  mug: "Taza",
  sticker: "Sticker",
};

export const isMockupKind = (value: unknown): value is MockupKind =>
  typeof value === "string" && (MOCKUP_KINDS as readonly string[]).includes(value);

export const DESIGN_STATUSES = ["draft", "published", "archived"] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

/** "Gato astronauta · Remera": how a design line is named in the cart, the quote and the order. */
export const designLineName = (designName: string, kind: MockupKind) => `${designName} · ${MOCKUP_KIND_LABELS[kind]}`;
