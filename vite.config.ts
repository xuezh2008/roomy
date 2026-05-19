import { defineConfig } from "vite";

// In dev (`vite`) base stays "/" so localhost:5173/ keeps working.
// On build (`vite build`) base becomes "/roomy/" because GitHub Pages
// serves this repo under https://<owner>.github.io/roomy/.
// If you change the repo name, change the base.

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/roomy/" : "/",
}));
