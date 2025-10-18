import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devHost = process.env.VITE_DEV_SERVER_HOST ?? "127.0.0.1";
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  build: {
    // Disable minification for better debugging in production
    minify: false,
    // Generate source maps for debugging
    sourcemap: true,
    // Keep original names for better error messages
    terserOptions: {
      keep_classnames: true,
      keep_fnames: true
    }
  },
  server: {
    host: devHost,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https")
      }
    }
  }
});
