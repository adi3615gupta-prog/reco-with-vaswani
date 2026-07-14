import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const silenceProxyErrors = (target: string, isTally = false) => ({
  target,
  changeOrigin: true,
  rewrite: isTally ? (p: string) => p.replace(/^\/tally-api/, '') : undefined,
  configure: (proxy: any) => {
    proxy.on('error', (err: any) => {
      // Silence connection reset errors from localtunnel/client disconnects
      if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) return;
      console.warn(`[Proxy Warning] ${isTally ? 'Tally' : 'API'} connection error:`, err.message);
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    watch: {
      ignored: ["**/dist-electron/**", "**/dist/**", "**/*.tmp"],
    },
    hmr: {
      overlay: false,
    },
    proxy: {
      '/tally-api': silenceProxyErrors('http://127.0.0.1:9000', true),
      '/api': silenceProxyErrors('http://127.0.0.1:3001'),
      '/sessions': silenceProxyErrors('http://127.0.0.1:3001'),
      '/audit': silenceProxyErrors('http://127.0.0.1:3001'),
      '/ban': silenceProxyErrors('http://127.0.0.1:3001'),
      '/launch-anydesk': silenceProxyErrors('http://127.0.0.1:3001'),
      '/screen': silenceProxyErrors('http://127.0.0.1:3001'),
      '/message': silenceProxyErrors('http://127.0.0.1:3001')
    },
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lovable-tagger", "playwright", "playwright-core"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "stream": path.resolve(__dirname, "./src/lib/dummy-stream.ts"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
