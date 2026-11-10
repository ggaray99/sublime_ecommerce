/** Points of sale: shared by the server, the admin and the public map (no server code here). */

export const POINT_KINDS = {
  tienda: "Tienda",
  kiosco: "Kiosco",
  libreria: "Librería",
  cafe: "Café / bar",
  feria: "Feria",
  otro: "Otro",
} as const;

export type PointKind = keyof typeof POINT_KINDS;

export type PointOfSale = {
  id: string;
  name: string;
  kind: PointKind;
  address: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  phone: string;
  instagram: string;
  notes: string;
  active: boolean;
  sortOrder: number;
};

/** What the map searches: exact coordinates when known, otherwise the full address. */
export function mapQuery(point: Pick<PointOfSale, "latitude" | "longitude" | "address" | "city" | "province">): string {
  return point.latitude !== null && point.longitude !== null
    ? `${point.latitude},${point.longitude}`
    : `${point.address}, ${point.city}, ${point.province}, Argentina`;
}
