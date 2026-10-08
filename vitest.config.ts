import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "admin-panel"],
    coverage: {
      provider: "v8",
      include: ["server/services/**", "lib/_core/**"],
      exclude: ["node_modules", "tests", "dist"],
    },
  },
});
