import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const htmlPages = [
  "index.html",
  "edit-request.html",
  ...Array.from({ length: 12 }, (_, index) => `index${index + 1}.html`),
];

const tenantBuilds = {
  d1: "calling-card-d1",
  remo: "main",
  aljon: "aljon-contacts",
};

export default defineConfig(({ mode }) => {
  const numberedTenant = /^d([1-9]\d*)$/.exec(mode);
  const tenant = tenantBuilds[mode]
    || (numberedTenant
      ? `calling-card-${mode}`
      : null);

  return {
    define: tenant
      ? { "import.meta.env.VITE_SITE_ID": JSON.stringify(tenant) }
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
  };
});
