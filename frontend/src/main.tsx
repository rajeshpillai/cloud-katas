import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app";
import { installChunkReloadHandler } from "./lib/reload";
import "./styles/global.css";

// Recover automatically if a stale index.html points at chunks a later deploy
// deleted (see src/lib/reload.ts).
installChunkReloadHandler();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
