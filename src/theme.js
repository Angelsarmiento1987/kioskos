import { useEffect, useState } from "react";
export function initialTheme() {
  try { const value = localStorage.getItem("rekreo-theme"); if (["light", "dark"].includes(value)) return value; } catch {}
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme; root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101d1b" : "#eaf1ec");
    try { localStorage.setItem("rekreo-theme", theme); } catch {}
  }, [theme]);
  // Keep manually selected preferences in sync between open web tabs.
  useEffect(() => {
    const change = (event) => { if (event.key === "rekreo-theme" && ["dark", "light"].includes(event.newValue)) setTheme(event.newValue); };
    window.addEventListener("storage", change); return () => window.removeEventListener("storage", change);
  }, []);
  return { theme, toggle: () => setTheme((old) => old === "dark" ? "light" : "dark") };
}
