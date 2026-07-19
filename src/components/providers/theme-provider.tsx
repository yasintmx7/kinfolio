"use client";

import { useEffect } from "react";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import {
  applyTheme,
  getStoredTheme,
  isAppTheme,
  setTheme,
  type AppTheme,
} from "@/lib/theme";

/**
 * Keeps <html> class + localStorage in sync with Dexie settings.theme.
 * Boot script already painted the stored theme; this reconciles after load.
 */
export function ThemeSync() {
  const { settings, ready, patchSettings } = usePortfolioContext();

  useEffect(() => {
    // Before settings hydrate, keep whatever localStorage said
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (!ready || !settings) return;
    const fromSettings = isAppTheme(settings.theme) ? settings.theme : "dark";
    const stored = getStoredTheme();
    // Prefer settings when both exist; write through to localStorage
    if (fromSettings !== stored) {
      setTheme(fromSettings);
    } else {
      applyTheme(fromSettings);
    }
  }, [ready, settings?.theme]);

  // Expose nothing — pure side-effect sync
  void patchSettings;
  return null;
}

export function useThemeToggle(): {
  theme: AppTheme;
  setAppTheme: (t: AppTheme) => void;
  toggle: () => void;
} {
  const { settings, patchSettings, ready } = usePortfolioContext();
  const theme: AppTheme =
    ready && settings && isAppTheme(settings.theme)
      ? settings.theme
      : getStoredTheme();

  function setAppTheme(t: AppTheme) {
    setTheme(t);
    void patchSettings({ theme: t });
  }

  function toggle() {
    setAppTheme(theme === "dark" ? "light" : "dark");
  }

  return { theme, setAppTheme, toggle };
}
