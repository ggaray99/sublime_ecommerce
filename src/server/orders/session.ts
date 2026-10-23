import { getSql, hasDatabase } from "../db/client.ts";
import { createShippingRepository, type ShippingRepository } from "../shipping/repository.ts";
import { createOrderRepository, type OrderRepository } from "./repository.ts";

/** Real orders exist only where the database does (staging/previews today). */
export const ordersAvailable = (): boolean => hasDatabase();

export function getOrderRepository(): OrderRepository {
  return createOrderRepository(getSql());
}

export function getShippingRepository(): ShippingRepository {
  return createShippingRepository(getSql());
}
