"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that asks before destructive actions. */
export function ConfirmButton({ message, children, className = "link-button" }: { message: string; children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
