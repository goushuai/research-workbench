import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";
import "./themes.css";
import { applyAppearance, readAppearance } from "./theme.js";
applyAppearance(
  readAppearance(),
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
