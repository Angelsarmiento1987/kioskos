import { listenForRecoveredCamera } from "./photo-recovery.js";
import { isAndroid } from "./native";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
if (isAndroid) {
  document.documentElement.dataset.platform = "android";
  listenForRecoveredCamera().catch(() => {});
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
