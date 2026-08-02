import "@yuance/frontend-ui/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";

import DesktopApp from "./app.jsx";
import { createDesktopAuthState } from "./platform/auth-state.js";
import { createDesktopNetworkState } from "./platform/network-state.js";
import { createDesktopRouter } from "./platform/router.js";
import { createDesktopFiles } from "./platform/files.js";
import "./app.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing Desktop renderer root.");

const bridge = globalThis.yuanceDesktop;
const services = Object.freeze({
  auth: createDesktopAuthState(bridge?.hostState, bridge?.auth),
  router: createDesktopRouter(),
  network: createDesktopNetworkState(bridge?.network),
  files: createDesktopFiles(bridge?.files),
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DesktopApp services={services} />
  </React.StrictMode>,
);
