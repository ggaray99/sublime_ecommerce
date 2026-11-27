"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { cx } from "./class-names.ts";
import { Button } from "./button";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, CloseIcon, InfoIcon } from "./icons";
import { toastDuration, toastReducer, type ToastItem, type ToastTone } from "./toast-queue.ts";
import styles from "./toast.module.css";

export type { ToastTone } from "./toast-queue.ts";

export type ShowToastOptions = {
  tone?: ToastTone;
  /** Milliseconds on screen; `null` stays until closed. Default: 5 s, errors stay. */
  duration?: number | null;
};

type ToastApi = {
  show: (message: string, options?: ShowToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** `const toast = useToast(); toast.show("Producto guardado", { tone: "success" })`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a <ToastProvider>.");
  return api;
}

const ICONS: Record<ToastTone, ReactNode> = {
  info: <InfoIcon />,
  success: <CheckCircleIcon />,
  warning: <AlertTriangleIcon />,
  critical: <AlertCircleIcon />,
};

/**
 * Holds the toasts and renders a polite live region (always in the DOM, so
 * screen readers pick up what is added). Put it inside the `.theme` wrapper.
 */
export function ToastProvider({ children, label = "Notificaciones" }: { children: ReactNode; label?: string }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => dispatch({ type: "dismiss", id }), []);
  const show = useCallback((message: string, options: ShowToastOptions = {}) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    dispatch({ type: "add", toast: { id, message, tone: options.tone ?? "info", duration: options.duration } });
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className={styles.region} aria-label={label}>
        <ol className={styles.list} aria-live="polite" aria-relevant="additions text">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

/** One toast: auto-dismisses unless hovered or focused (the timer pauses). */
function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const duration = toastDuration(toast.tone, toast.duration);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration ?? 0);

  useEffect(() => {
    if (duration === null || paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [duration, paused, onDismiss, toast.id]);

  return (
    <li
      className={cx(styles.toast, styles[toast.tone])}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {ICONS[toast.tone]}
      </span>
      <p className={styles.message}>{toast.message}</p>
      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Cerrar notificación"
        icon={<CloseIcon />}
        className={styles.close}
        onClick={() => onDismiss(toast.id)}
      />
    </li>
  );
}
