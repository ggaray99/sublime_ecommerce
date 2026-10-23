"use client";

import type { ReactNode } from "react";

/**
 * GET form that applies filters as soon as a select changes. Without
 * JavaScript it still works with its submit button.
 */
export function AutoSubmitForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  return (
    <form
      action={action}
      className={className}
      role="search"
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
