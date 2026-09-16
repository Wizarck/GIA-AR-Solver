import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    sourcemap: false,
  },
  server: {
    // plain HTTP dev server; getUserMedia works on localhost
    host: true,
  },
});
