"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { AdminRole } from "@/server/admin/repository";
import {
  BoxIcon,
  ClipboardIcon,
  ClockIcon,
  FolderIcon,
  GearIcon,
  HomeIcon,
  ImageIcon,
  LayoutIcon,
  MapPinIcon,
  PaletteIcon,
  PlugIcon,
  ReceiptIcon,
  ShirtIcon,
  SidebarIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
} from "../admin-icons";
import { cx } from "../ui/class-names.ts";
import { DESIGN_SYSTEM_LINK, isCurrentLink, NAV_HOME, navGroups, type NavIconKey, type NavLink } from "./nav-items.ts";
import { MENU_BUTTON_ID, SIDEBAR_ID, SMALL_SCREEN, useShellNav } from "./shell-state";
import styles from "./shell.module.css";

const ICONS: Record<NavIconKey, () => ReactNode> = {
  home: HomeIcon,
  receipt: ReceiptIcon,
  clipboard: ClipboardIcon,
  users: UsersIcon,
  tag: TagIcon,
  box: BoxIcon,
  image: ImageIcon,
  shirt: ShirtIcon,
  folder: FolderIcon,
  layout: LayoutIcon,
  truck: TruckIcon,
  "map-pin": MapPinIcon,
  plug: PlugIcon,
  gear: GearIcon,
  clock: ClockIcon,
  palette: PaletteIcon,
};

/**
 * Side menu of the panel. Wide screens: 240px with names, or folded to a rail
 * of icons whose names show as tooltips on hover and keyboard focus (the
 * choice is remembered on this browser). Small screens: hidden, opened over
 * the content from the top bar's menu button; choosing a section, Escape or a
 * click outside closes it.
 */
export function Sidebar({ role }: { role: AdminRole }) {
  const path = usePathname();
  const { expanded, toggleExpanded, overlayOpen, setOverlayOpen } = useShellNav();
  const menuRef = useRef<HTMLElement>(null);

  // Overlay open: focus its first link; Escape closes it and returns to the menu button.
  useEffect(() => {
    if (!overlayOpen || !window.matchMedia(SMALL_SCREEN).matches) return;
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOverlayOpen(false);
      document.getElementById(MENU_BUTTON_ID)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlayOpen, setOverlayOpen]);

  const onNavigate = () => setOverlayOpen(false);

  const item = (link: NavLink, className?: string) => {
    const Icon = ICONS[link.icon];
    return (
      <Link
        href={link.href}
        className={cx(styles.link, className)}
        aria-current={isCurrentLink(link, path) ? "page" : undefined}
        onClick={onNavigate}
      >
        <Icon />
        <span className={styles.label}>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      {overlayOpen && <div className={styles.backdrop} aria-hidden="true" onClick={() => setOverlayOpen(false)} />}
      <aside
        id={SIDEBAR_ID}
        className={styles.sidebar}
        aria-label="Menú del panel"
        data-expanded={expanded ? "true" : "false"}
        data-overlay={overlayOpen ? "open" : "closed"}
      >
        <nav ref={menuRef} className={styles.menu} aria-label="Secciones del panel">
          <ul className={styles.list}>
            <li>{item(NAV_HOME)}</li>
          </ul>
          {navGroups(role).map((group) => (
            <div key={group.label} className={styles.group}>
              <p className={styles.groupLabel}>{group.label}</p>
              <ul className={styles.list}>
                {group.links.map((link) => (
                  <li key={link.href}>{item(link)}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          {item(DESIGN_SYSTEM_LINK, styles.linkSubdued)}
          <button type="button" className={cx(styles.link, styles.foldToggle)} aria-expanded={expanded} aria-controls={SIDEBAR_ID} onClick={toggleExpanded}>
            <SidebarIcon open={expanded} />
            <span className={styles.label}>{expanded ? "Contraer menú" : "Expandir menú"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
