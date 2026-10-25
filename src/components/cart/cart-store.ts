"use client";

import { useSyncExternalStore } from "react";
import type { Product } from "@/data/products";
import { addLine, parseCart, removeLine, setQuantity, summarizeCart, type CartLine } from "@/lib/cart";

const STORAGE_KEY = "sublime-demo-cart-v1";
const EMPTY: CartLine[] = [];

const listeners = new Set<() => void>();
let memoryLines: CartLine[] = EMPTY;
let cachedRaw: string | null = null;
let cachedLines: CartLine[] = EMPTY;

/** Returns `undefined` when storage is blocked (private mode, disabled cookies…). */
function readRaw(): string | null | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
}

function getSnapshot(): CartLine[] {
  const raw = readRaw();
  if (raw === undefined) return memoryLines;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLines = parseCart(raw);
  }
  return cachedLines;
}

const getServerSnapshot = () => EMPTY;

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(lines: CartLine[]) {
  memoryLines = lines;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage unavailable: the cart keeps working in memory for this visit.
  }
  listeners.forEach((listener) => listener());
}

export const cartActions = {
  /** `sku` picks the variant (size, color…) of products with options. */
  add(productId: string, quantity = 1, sku?: string) {
    write(addLine(getSnapshot(), productId, quantity, sku));
  },
  setQuantity(productId: string, quantity: number, sku?: string) {
    write(setQuantity(getSnapshot(), productId, quantity, sku));
  },
  remove(productId: string, sku?: string) {
    write(removeLine(getSnapshot(), productId, sku));
  },
  clear() {
    write(EMPTY);
  },
};

export function useCartLines(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Cart pages pass the server catalog (database prices where connected). */
export function useCartSummary(catalog: readonly Product[]) {
  return summarizeCart(useCartLines(), catalog);
}

/**
 * Units in the cart, for the header badge. Needs no catalog, so the header
 * never ships product data to the browser; unknown products are dropped when
 * the cart page quotes them.
 */
export function useCartCount(): number {
  return useCartLines().reduce((total, line) => total + line.quantity, 0);
}

const noopSubscribe = () => () => {};

/** `false` during SSR and hydration, `true` once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
