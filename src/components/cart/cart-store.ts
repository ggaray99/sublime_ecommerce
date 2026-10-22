"use client";

import { useSyncExternalStore } from "react";
import { products } from "@/data/products";
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
  add(productId: string, quantity = 1) {
    write(addLine(getSnapshot(), productId, quantity));
  },
  setQuantity(productId: string, quantity: number) {
    write(setQuantity(getSnapshot(), productId, quantity));
  },
  remove(productId: string) {
    write(removeLine(getSnapshot(), productId));
  },
  clear() {
    write(EMPTY);
  },
};

export function useCartLines(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCartSummary() {
  return summarizeCart(useCartLines(), products);
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
