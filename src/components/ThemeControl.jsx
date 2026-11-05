import React from "react";
import { Moon, Sun } from "lucide-react";
export default function ThemeControl({ theme, toggle, floating = false }) {
  const dark = theme === "dark";
  return <button type="button" className={`utility-button theme-control ${floating ? "theme-floating" : ""}`}
    onClick={toggle} aria-label={dark ? "Usar modo claro" : "Usar modo oscuro"} title={dark ? "Usar modo claro" : "Usar modo oscuro"}>
    {dark ? <Sun size={17} /> : <Moon size={17} />}<span>{dark ? "Modo claro" : "Modo oscuro"}</span>
  </button>;
}
