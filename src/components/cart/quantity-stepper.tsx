"use client";

import { useId } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function QuantityStepper({ label, value, min, max, onChange }: Props) {
  const id = useId();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="stepper" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="visually-hidden">
        {label}
      </span>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Restar uno">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) set(next);
        }}
      />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Sumar uno">
        +
      </button>
    </div>
  );
}
