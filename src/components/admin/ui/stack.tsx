import type { CSSProperties, ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./stack.module.css";

/** Steps of the spacing scale (`--sa-space-N`). */
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

type LayoutProps = {
  gap?: SpaceStep;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  className?: string;
  children?: ReactNode;
};

const gapStyle = (gap: SpaceStep) => ({ "--layout-gap": `var(--sa-space-${gap})` }) as CSSProperties;

/** Vertical layout with a token gap. */
export function Stack({ gap = 4, align = "stretch", className, children }: LayoutProps) {
  return (
    <div className={cx(styles.stack, className)} style={{ ...gapStyle(gap), alignItems: align }}>
      {children}
    </div>
  );
}

/** Horizontal row that wraps, with a token gap. */
export function Inline({
  gap = 2,
  align = "center",
  justify = "start",
  wrap = true,
  className,
  children,
}: LayoutProps & { justify?: "start" | "center" | "end" | "space-between"; wrap?: boolean }) {
  return (
    <div className={cx(styles.inline, className)} style={{ ...gapStyle(gap), alignItems: align, justifyContent: justify, flexWrap: wrap ? "wrap" : "nowrap" }}>
      {children}
    </div>
  );
}
