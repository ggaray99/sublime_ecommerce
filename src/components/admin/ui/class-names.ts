/** Joins class names, skipping falsy values: `cx(styles.a, on && styles.b)`. */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
