// vite.config.ts
import { defineConfig } from "file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/node_modules/vite/dist/node/index.js";
import react from "file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
var __vite_injected_original_dirname = "D:\\My software\\full and final\\gst consolidater\\reco-with-vaswani-main";
var silenceProxyErrors = (target, isTally = false) => ({
  target,
  changeOrigin: true,
  rewrite: isTally ? (p) => p.replace(/^\/tally-api/, "") : void 0,
  configure: (proxy) => {
    proxy.on("error", (err) => {
      if (err.code === "ECONNRESET" || err.message?.includes("ECONNRESET")) return;
      console.warn(`[Proxy Warning] ${isTally ? "Tally" : "API"} connection error:`, err.message);
    });
  }
});
var vite_config_default = defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
    watch: {
      ignored: ["**/dist-electron/**", "**/dist/**", "**/*.tmp"]
    },
    hmr: {
      overlay: false
    },
    proxy: {
      "/tally-api": silenceProxyErrors("http://127.0.0.1:9000", true),
      "/api": silenceProxyErrors("http://127.0.0.1:3001"),
      "/sessions": silenceProxyErrors("http://127.0.0.1:3001"),
      "/audit": silenceProxyErrors("http://127.0.0.1:3001"),
      "/ban": silenceProxyErrors("http://127.0.0.1:3001"),
      "/launch-anydesk": silenceProxyErrors("http://127.0.0.1:3001"),
      "/screen": silenceProxyErrors("http://127.0.0.1:3001"),
      "/message": silenceProxyErrors("http://127.0.0.1:3001")
    }
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lovable-tagger", "playwright", "playwright-core"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "stream": path.resolve(__vite_injected_original_dirname, "./src/lib/dummy-stream.ts")
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxNeSBzb2Z0d2FyZVxcXFxmdWxsIGFuZCBmaW5hbFxcXFxnc3QgY29uc29saWRhdGVyXFxcXHJlY28td2l0aC12YXN3YW5pLW1haW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXE15IHNvZnR3YXJlXFxcXGZ1bGwgYW5kIGZpbmFsXFxcXGdzdCBjb25zb2xpZGF0ZXJcXFxccmVjby13aXRoLXZhc3dhbmktbWFpblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovTXklMjBzb2Z0d2FyZS9mdWxsJTIwYW5kJTIwZmluYWwvZ3N0JTIwY29uc29saWRhdGVyL3JlY28td2l0aC12YXN3YW5pLW1haW4vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbmNvbnN0IHNpbGVuY2VQcm94eUVycm9ycyA9ICh0YXJnZXQ6IHN0cmluZywgaXNUYWxseSA9IGZhbHNlKSA9PiAoe1xuICB0YXJnZXQsXG4gIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgcmV3cml0ZTogaXNUYWxseSA/IChwOiBzdHJpbmcpID0+IHAucmVwbGFjZSgvXlxcL3RhbGx5LWFwaS8sICcnKSA6IHVuZGVmaW5lZCxcbiAgY29uZmlndXJlOiAocHJveHk6IGFueSkgPT4ge1xuICAgIHByb3h5Lm9uKCdlcnJvcicsIChlcnI6IGFueSkgPT4ge1xuICAgICAgLy8gU2lsZW5jZSBjb25uZWN0aW9uIHJlc2V0IGVycm9ycyBmcm9tIGxvY2FsdHVubmVsL2NsaWVudCBkaXNjb25uZWN0c1xuICAgICAgaWYgKGVyci5jb2RlID09PSAnRUNPTk5SRVNFVCcgfHwgZXJyLm1lc3NhZ2U/LmluY2x1ZGVzKCdFQ09OTlJFU0VUJykpIHJldHVybjtcbiAgICAgIGNvbnNvbGUud2FybihgW1Byb3h5IFdhcm5pbmddICR7aXNUYWxseSA/ICdUYWxseScgOiAnQVBJJ30gY29ubmVjdGlvbiBlcnJvcjpgLCBlcnIubWVzc2FnZSk7XG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcbiAgYmFzZTogXCIuL1wiLFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiBcIjo6XCIsXG4gICAgcG9ydDogODA4MCxcbiAgICB3YXRjaDoge1xuICAgICAgaWdub3JlZDogW1wiKiovZGlzdC1lbGVjdHJvbi8qKlwiLCBcIioqL2Rpc3QvKipcIiwgXCIqKi8qLnRtcFwiXSxcbiAgICB9LFxuICAgIGhtcjoge1xuICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgfSxcbiAgICBwcm94eToge1xuICAgICAgJy90YWxseS1hcGknOiBzaWxlbmNlUHJveHlFcnJvcnMoJ2h0dHA6Ly8xMjcuMC4wLjE6OTAwMCcsIHRydWUpLFxuICAgICAgJy9hcGknOiBzaWxlbmNlUHJveHlFcnJvcnMoJ2h0dHA6Ly8xMjcuMC4wLjE6MzAwMScpLFxuICAgICAgJy9zZXNzaW9ucyc6IHNpbGVuY2VQcm94eUVycm9ycygnaHR0cDovLzEyNy4wLjAuMTozMDAxJyksXG4gICAgICAnL2F1ZGl0Jzogc2lsZW5jZVByb3h5RXJyb3JzKCdodHRwOi8vMTI3LjAuMC4xOjMwMDEnKSxcbiAgICAgICcvYmFuJzogc2lsZW5jZVByb3h5RXJyb3JzKCdodHRwOi8vMTI3LjAuMC4xOjMwMDEnKSxcbiAgICAgICcvbGF1bmNoLWFueWRlc2snOiBzaWxlbmNlUHJveHlFcnJvcnMoJ2h0dHA6Ly8xMjcuMC4wLjE6MzAwMScpLFxuICAgICAgJy9zY3JlZW4nOiBzaWxlbmNlUHJveHlFcnJvcnMoJ2h0dHA6Ly8xMjcuMC4wLjE6MzAwMScpLFxuICAgICAgJy9tZXNzYWdlJzogc2lsZW5jZVByb3h5RXJyb3JzKCdodHRwOi8vMTI3LjAuMC4xOjMwMDEnKVxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogW1wibG92YWJsZS10YWdnZXJcIiwgXCJwbGF5d3JpZ2h0XCIsIFwicGxheXdyaWdodC1jb3JlXCJdXG4gIH0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgICBcInN0cmVhbVwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjL2xpYi9kdW1teS1zdHJlYW0udHNcIiksXG4gICAgfSxcbiAgICBkZWR1cGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIiwgXCJyZWFjdC9qc3gtZGV2LXJ1bnRpbWVcIiwgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIiwgXCJAdGFuc3RhY2svcXVlcnktY29yZVwiXSxcbiAgfSxcbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBbVosU0FBUyxvQkFBb0I7QUFDaGIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUl6QyxJQUFNLHFCQUFxQixDQUFDLFFBQWdCLFVBQVUsV0FBVztBQUFBLEVBQy9EO0FBQUEsRUFDQSxjQUFjO0FBQUEsRUFDZCxTQUFTLFVBQVUsQ0FBQyxNQUFjLEVBQUUsUUFBUSxnQkFBZ0IsRUFBRSxJQUFJO0FBQUEsRUFDbEUsV0FBVyxDQUFDLFVBQWU7QUFDekIsVUFBTSxHQUFHLFNBQVMsQ0FBQyxRQUFhO0FBRTlCLFVBQUksSUFBSSxTQUFTLGdCQUFnQixJQUFJLFNBQVMsU0FBUyxZQUFZLEVBQUc7QUFDdEUsY0FBUSxLQUFLLG1CQUFtQixVQUFVLFVBQVUsS0FBSyxzQkFBc0IsSUFBSSxPQUFPO0FBQUEsSUFDNUYsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUdBLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxPQUFPO0FBQUEsRUFDekMsTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsU0FBUyxDQUFDLHVCQUF1QixjQUFjLFVBQVU7QUFBQSxJQUMzRDtBQUFBLElBQ0EsS0FBSztBQUFBLE1BQ0gsU0FBUztBQUFBLElBQ1g7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLGNBQWMsbUJBQW1CLHlCQUF5QixJQUFJO0FBQUEsTUFDOUQsUUFBUSxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDbEQsYUFBYSxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDdkQsVUFBVSxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDcEQsUUFBUSxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDbEQsbUJBQW1CLG1CQUFtQix1QkFBdUI7QUFBQSxNQUM3RCxXQUFXLG1CQUFtQix1QkFBdUI7QUFBQSxNQUNyRCxZQUFZLG1CQUFtQix1QkFBdUI7QUFBQSxJQUN4RDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsa0JBQWtCLGNBQWMsaUJBQWlCO0FBQUEsRUFDN0Q7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUNwQyxVQUFVLEtBQUssUUFBUSxrQ0FBVywyQkFBMkI7QUFBQSxJQUMvRDtBQUFBLElBQ0EsUUFBUSxDQUFDLFNBQVMsYUFBYSxxQkFBcUIseUJBQXlCLHlCQUF5QixzQkFBc0I7QUFBQSxFQUM5SDtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
