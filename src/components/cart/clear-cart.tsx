"use client";

import { useEffect } from "react";
import { cartActions } from "./cart-store";

/** Empties the browser cart once the order exists (the redirect comes from the server). */
export function ClearCart() {
  useEffect(() => {
    cartActions.clear();
  }, []);
  return null;
}
