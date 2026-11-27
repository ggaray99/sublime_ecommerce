export type ToastTone = "info" | "success" | "warning" | "critical";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
  /** Milliseconds on screen; `null` stays until closed. Defaults by tone. */
  duration?: number | null;
};

export type ToastAction = { type: "add"; toast: ToastItem } | { type: "dismiss"; id: string } | { type: "clear" };

/** More toasts than this push the oldest out, so the region never piles up. */
export const MAX_TOASTS = 3;

export function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case "add":
      if (state.some((toast) => toast.id === action.toast.id)) return state;
      return [...state, action.toast].slice(-MAX_TOASTS);
    case "dismiss":
      return state.some((toast) => toast.id === action.id) ? state.filter((toast) => toast.id !== action.id) : state;
    case "clear":
      return [];
  }
}

/**
 * How long a toast stays: 5 s by default (paused while hovered or focused),
 * while errors stay until closed so nobody misses them (WCAG 2.2.1).
 */
export function toastDuration(tone: ToastTone, duration?: number | null): number | null {
  if (duration !== undefined) return duration;
  return tone === "critical" ? null : 5000;
}
