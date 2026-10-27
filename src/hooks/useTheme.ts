"use client";

import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return mode === "dark";
}

// Re-applies the saved theme; keep in sync with THEME_INIT_SCRIPT in app/layout.tsx
export function applyStoredTheme() {
  const stored = localStorage.getItem("theme");
  const dark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [isDark, setIsDark] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null;
    const initial: ThemeMode = stored === "light" || stored === "dark" ? stored : "system";
    setMode(initial);
    const dark = resolveIsDark(initial);
    setIsDark(dark);
    applyTheme(dark);
  }, []);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
      applyTheme(e.matches);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  // Cycle: light → dark → system → light
  const cycleTheme = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
      if (next === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", next);
      }
      const dark = resolveIsDark(next);
      setIsDark(dark);
      applyTheme(dark);
      return next;
    });
  }, []);

  return { isDark, mode, cycleTheme };
}
