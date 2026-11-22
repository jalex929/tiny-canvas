import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build works at /tiny-canvas/, /games/tiny-canvas/, or anywhere else.
  base: "./",
  plugins: [react()],
  server: { port: 5174 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
