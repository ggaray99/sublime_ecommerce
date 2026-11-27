"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MenuIcon } from "../admin-icons";
import { ToastProvider } from "../ui/toast";
import styles from "./shell.module.css";

/** Below this width the sidebar is an overlay opened from the top bar. */
export const SMALL_SCREEN = "(max-width: 899px)";
export const SIDEBAR_ID = "admin-sidebar";
export const MENU_BUTTON_ID = "admin-menu-button";
const STORAGE_KEY = "sublime-admin-nav";

type ShellNav = {
  /** Wide screens: full menu (true) or icon rail (false). Remembered on this browser. */
  expanded: boolean;
  toggleExpanded: () => void;
  /** Small screens: the menu is open over the content. */
  overlayOpen: boolean;
  setOverlayOpen: (open: boolean) => void;
};

const ShellNavContext = createContext<ShellNav | null>(null);

export function useShellNav(): ShellNav {
  const value = useContext(ShellNavContext);
  if (!value) throw new Error("useShellNav needs the AdminShell.");
  return value;
}

/** Client state shared by the top bar and the sidebar, plus the one toast region of the panel. */
export function ShellProviders({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Restore the wide-screen choice after hydration (the server cannot know it).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: keep the default.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once after hydration
    if (saved === "closed") setExpanded(false);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
      } catch {
        // Storage blocked: the choice lasts for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ expanded, toggleExpanded, overlayOpen, setOverlayOpen }), [expanded, toggleExpanded, overlayOpen]);

  return (
    <ShellNavContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </ShellNavContext.Provider>
  );
}

/** Top bar button that opens the sidebar over the content (small screens only; hidden by CSS above). */
export function SidebarMenuButton() {
  const { overlayOpen, setOverlayOpen } = useShellNav();
  return (
    <button
      type="button"
      id={MENU_BUTTON_ID}
      className={styles.menuButton}
      aria-controls={SIDEBAR_ID}
      aria-expanded={overlayOpen}
      aria-label={overlayOpen ? "Cerrar menú" : "Abrir menú"}
      onClick={() => setOverlayOpen(!overlayOpen)}
    >
      <MenuIcon />
    </button>
  );
}
