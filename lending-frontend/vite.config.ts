import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  // Empty prefix so plain RPC_URL is picked up, and the repo root is searched too
  // because that is where the deploy scripts keep their .env. This value is used
  // by the dev proxy only — it never reaches the browser bundle.
  const env = { ...loadEnv(mode, "..", ""), ...loadEnv(mode, process.cwd(), "") };
  const rpc = env.RPC_URL || env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com";
  return {
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
        target: rpc,
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
};
});
