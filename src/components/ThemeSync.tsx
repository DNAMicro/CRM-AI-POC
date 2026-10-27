"use client";

import { useLayoutEffect } from "react";
import { applyStoredTheme } from "@/hooks/useTheme";

// The inline script in the root layout sets the theme before first paint.
// In development, Strict Mode's remount resets <html> to its JSX className,
// so re-apply here. This is a no-op in production.
export function ThemeSync() {
  useLayoutEffect(() => {
    applyStoredTheme();
  }, []);
  return null;
}
