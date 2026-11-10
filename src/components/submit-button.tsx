"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that disables itself while the form is sent (no double submits). */
export function SubmitButton({ children, pendingLabel, className = "btn btn--coal" }: { children: ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
