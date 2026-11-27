import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./button.module.css";
import utilities from "./utilities.module.css";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "critical";
export type ButtonSize = "sm" | "md";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps focus and blocks clicks/submits (aria-busy). */
  loading?: boolean;
  /** Icon before the label (decorative). */
  icon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
};

/** An icon-only button must be named for screen readers. */
type LabelProps = { iconOnly?: false; children: ReactNode } | { iconOnly: true; "aria-label": string; children?: never };

type NativeButtonProps = Omit<ComponentPropsWithRef<"button">, keyof CommonProps | "children"> & { href?: undefined };
type LinkButtonProps = Omit<ComponentPropsWithRef<typeof Link>, keyof CommonProps | "children" | "href"> & { href: string };

export type ButtonProps = CommonProps & LabelProps & (NativeButtonProps | LinkButtonProps);

/**
 * Action button. Renders a <button> (type="button" by default) or, with
 * `href`, a Next.js <Link> that looks the same.
 */
export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "md", loading = false, icon, fullWidth, className, iconOnly, children, ...rest } = props;
  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    iconOnly && styles.iconOnly,
    fullWidth && styles.fullWidth,
    loading && styles.loading,
    className,
  );
  const content = (
    <>
      {loading && <span className={cx(utilities.spinner, styles.spinner)} aria-hidden="true" />}
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {!iconOnly && <span className={styles.label}>{children}</span>}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...linkProps } = rest as LinkButtonProps;
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", onClick, ...buttonProps } = rest as NativeButtonProps;
  return (
    <button
      // While loading the button stays focusable but cannot click or submit again.
      type={loading ? "button" : type}
      onClick={loading ? undefined : onClick}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={classes}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
