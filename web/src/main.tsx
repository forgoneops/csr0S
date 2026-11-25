import { createRoot } from "react-dom/client";
import { StoreProvider } from "./store";
import { App } from "./shell/App";
import { TerminalProvider } from "./terminal/state";
import "./base.css";
import "./terminal/terminal.css";
import { registerServiceWorker } from "./pwa";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <TerminalProvider>
      <App />
    </TerminalProvider>
  </StoreProvider>,
);
