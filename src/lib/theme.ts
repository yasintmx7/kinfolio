/** App theme preference — localStorage for instant paint, Dexie settings for persistence. */

export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "kinfolio:theme";

/** In-memory fallback when localStorage is missing/broken (tests / private mode). */
const memory = new Map<string, string>();

export function isAppTheme(v: unknown): v is AppTheme {
  return v === "dark" || v === "light";
}

function readRaw(): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      if (v != null) return v;
    }
  } catch {
    /* ignore */
  }
  return memory.get(THEME_STORAGE_KEY) ?? null;
}

function writeRaw(value: string): void {
  memory.set(THEME_STORAGE_KEY, value);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    }
  } catch {
    /* memory only */
  }
}

export function getStoredTheme(): AppTheme {
  const raw = readRaw();
  if (isAppTheme(raw)) return raw;
  return "dark";
}

export function storeTheme(theme: AppTheme): void {
  writeRaw(theme);
}

/** Apply theme to <html> classList + theme-color meta. */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "light" ? "#efe8dc" : "#060c14",
    );
  }
}

export function setTheme(theme: AppTheme): void {
  storeTheme(theme);
  applyTheme(theme);
}

export function toggleTheme(current: AppTheme): AppTheme {
  const next: AppTheme = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Inline boot script — run before first paint to avoid flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t="dark";var d=document.documentElement;d.classList.remove("dark","light");d.classList.add(t);d.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark");}})();`;
