import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleProxyRequest } from "./server/proxyCore.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-ai-proxy",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/")) {
            next();
            return;
          }

          const handled = await handleProxyRequest(req, res);
          if (!handled) {
            next();
          }
        });
      },
    },
  ],
});
