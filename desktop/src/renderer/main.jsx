import "@yuance/frontend-ui/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";

import DesktopApp from "./app.jsx";
import { createDesktopAuthState } from "./platform/auth-state.js";
import { createDesktopRouter } from "./platform/router.js";
import { createUnavailableFileAdapter, createUnavailableNetworkAdapter } from "./platform/unavailable.js";
import "./app.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing Desktop renderer root.");

const bridge = globalThis.yuanceDesktop?.hostState;
const services = Object.freeze({
  auth: createDesktopAuthState(bridge),
  router: createDesktopRouter(),
  network: createUnavailableNetworkAdapter(),
  files: createUnavailableFileAdapter(),
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DesktopApp services={services} />
  </React.StrictMode>,
);
