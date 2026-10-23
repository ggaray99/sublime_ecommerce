/**
 * Available quantity per SKU. `null` means stock is not tracked (made to order
 * or not yet defined by the business): the quote neither blocks nor promises it.
 */
export type Availability = Map<string, number | null>;

export interface InventoryRepository {
  getAvailability(skus: readonly string[]): Promise<Availability>;
}

/** Until stock rules are defined, no SKU is tracked. */
export function createUntrackedInventoryRepository(): InventoryRepository {
  return {
    async getAvailability(skus) {
      return new Map(skus.map((sku) => [sku, null]));
    },
  };
}

/** Fixed quantities, for tests and for rehearsing stock rules. */
export function createFixedInventoryRepository(quantities: Record<string, number>): InventoryRepository {
  return {
    async getAvailability(skus) {
      return new Map(skus.map((sku) => [sku, sku in quantities ? quantities[sku] : null]));
    },
  };
}
