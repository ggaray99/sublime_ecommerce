"use client";

import { useSyncExternalStore } from "react";

export type Toast = { id: number; message: string };

const listeners = new Set<() => void>();
let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

export function showToast(message: string) {
  current = { id: nextId++, message };
  clearTimeout(timer);
  timer = setTimeout(dismissToast, 4500);
  emit();
}

export function dismissToast() {
  clearTimeout(timer);
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
