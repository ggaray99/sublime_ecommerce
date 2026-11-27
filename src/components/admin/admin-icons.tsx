import type { ReactNode, SVGProps } from "react";

/**
 * Outline icons for the admin side menu and top bar: 18px, drawn on a 24px grid with a
 * 2-unit stroke (1.5px on screen), in the text colour. Decorative only: the
 * link or button around each icon carries the name.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export type AdminIcon = () => ReactNode;

export function ReceiptIcon() {
  return (
    <Icon>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  );
}

export function ClipboardIcon() {
  return (
    <Icon>
      <path d="M9 5H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

export function UsersIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.8 3 2.8 3 5.5" />
    </Icon>
  );
}

export function TagIcon() {
  return (
    <Icon>
      <path d="M3 4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icon>
  );
}

export function BoxIcon() {
  return (
    <Icon>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </Icon>
  );
}

export function ImageIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </Icon>
  );
}

export function ShirtIcon() {
  return (
    <Icon>
      <path d="M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" />
    </Icon>
  );
}

export function FolderIcon() {
  return (
    <Icon>
      <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 9.5V20h14V9.5M10 20v-5h4v5" />
    </Icon>
  );
}

/** Portada (the store's home page layout); Inicio keeps the house. */
export function LayoutIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M10 9v11" />
    </Icon>
  );
}

export function PaletteIcon() {
  return (
    <Icon>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9l-.3-.8c-.4-1.1.4-2.3 1.6-2.3H17a4 4 0 0 0 4-4c0-5-4-9-9-9z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </Icon>
  );
}

/** Three lines: opens the side menu on small screens. */
export function MenuIcon() {
  return (
    <Icon>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function TruckIcon() {
  return (
    <Icon>
      <path d="M4.5 17.5H3V6h11v11.5M14 9h4l3 4v4.5h-1.5M8.5 17.5h7" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </Icon>
  );
}

export function MapPinIcon() {
  return (
    <Icon>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

export function PlugIcon() {
  return (
    <Icon>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />
    </Icon>
  );
}

export function GearIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" />
    </Icon>
  );
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

/** Side-panel icon of the menu toggle; the chevron points where the menu goes. */
export function SidebarIcon({ open }: { open: boolean }) {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d={open ? "M16 10l-2 2 2 2" : "M14 10l2 2-2 2"} />
    </Icon>
  );
}
