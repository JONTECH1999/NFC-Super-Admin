import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const htmlPages = [
  "index.html",
  "edit-request.html",
  ...Array.from({ length: 12 }, (_, index) => `index${index + 1}.html`),
];

export default defineConfig(({ mode }) => ({
  define: mode === "d2" || mode === "d3" || mode === "d4" || mode === "d5" || mode === "d6" || mode === "d7" || mode === "d8" || mode === "d9" || mode === "d10"
    ? (() => {
      const suffix = mode;
      return {
        "import.meta.env.VITE_SITE_ID": JSON.stringify(`calling-card-${suffix}`),
        "import.meta.env.VITE_PROFILES_TABLE": JSON.stringify(`calling_card_${suffix}_profiles`),
        "import.meta.env.VITE_PRODUCTS_TABLE": JSON.stringify(`calling_card_${suffix}_products`),
      };
    })()
    : {},
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        htmlPages.map((page) => [page.slice(0, -5), resolve(rootDir, page)]),
      ),
    },
  },
  server: {
    // Handle SPA routes in dev — /admin and /shop serve index.html
    // so React can handle routing client-side
    historyApiFallback: true,
  },
}));
