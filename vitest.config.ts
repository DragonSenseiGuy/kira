import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In Nuxt, `~` points to the `app/` directory.
const appDir = path.join(__dirname, "app").replace(/\\/g, "/");

export default defineConfig({
  plugins: [vue()], // compiles .vue imports for mount tests
  // Vitest 4: pool settings live at the top level (not under `test`).
  // maxForks bounds concurrent happy-dom environments, which are the
  // suite's dominant memory cost (system-RAM friendly on modest machines).
  // `npm test` goes through scripts/run-tests.mjs, which runs each file in
  // its own short-lived process so fork memory never accumulates across
  // files regardless of how large the suite grows.
  pool: "forks",
  maxForks: 4,
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    // Coverage targets the pure logic layers; .vue components are excluded
    // until mount-test coverage matures (they drag in Nuxt context).
    coverage: {
      provider: "v8",
      include: ["app/composables/**/*.js", "app/utils/**/*.js"],
      reportsDirectory: "coverage",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "~": appDir,
      "@": appDir, // some components use the @/ spelling (e.g. defaultParameters)
    },
  },
});

