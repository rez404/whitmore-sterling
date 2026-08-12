import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  server: {
    // `api/rpc.js` is a Vercel function and does not exist under `vite dev`, so
    // proxy the same path straight to the upstream RPC while developing.
    proxy: {
      "/api/rpc": {
        target: "https://rpc.mainnet.chain.robinhood.com",
        changeOrigin: true,
        rewrite: () => "/",
      },
    },
  },
  build: {
    // Split heavy vendor libraries out of the main app chunk to improve first paint.
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ["ethers"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
