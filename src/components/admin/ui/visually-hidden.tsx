import type { ReactNode } from "react";
import utilities from "./utilities.module.css";

/** Text for screen readers only. */
export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className={utilities.visuallyHidden}>
      {children}
    </span>
  );
}
