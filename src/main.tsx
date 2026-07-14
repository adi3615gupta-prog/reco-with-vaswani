import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// API routing is now handled by the centralized src/lib/api.ts module.
// No more global fetch monkey-patching — all API calls go through api.ts helpers.

createRoot(document.getElementById("root")!).render(<App />);
