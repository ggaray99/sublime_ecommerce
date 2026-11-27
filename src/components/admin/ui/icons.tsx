import type { ReactNode, SVGProps } from "react";

/**
 * Small outline icons used inside the primitives (16px, 24px grid, 2-unit
 * stroke, current colour). Decorative: the surrounding control names them.
 */
function Icon({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

type IconProps = { size?: number };

export const CloseIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const ChevronLeftIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
export const ChevronRightIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
export const ChevronDownIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const ArrowLeftIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Icon>
);
export const SearchIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const InfoIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
);
export const CheckCircleIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);
export const AlertTriangleIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);
export const AlertCircleIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);
export const InboxIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" />
  </Icon>
);
export const ChartIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Icon>
);
