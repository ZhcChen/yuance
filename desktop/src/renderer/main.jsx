import "@yuance/frontend-ui/styles.css";
import "@yuance/frontend-app-shell/application.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { createApiClient } from "@yuance/frontend-api-client";

import DesktopApp from "./app.jsx";
import { createDesktopAuthState } from "./platform/auth-state.js";
import { createDesktopNetworkState } from "./platform/network-state.js";
import { createDesktopRouter } from "./platform/router.js";
import { createDesktopFiles } from "./platform/files.js";
import { createDesktopApiTransport } from "./platform/api-transport.js";
import { createDesktopEvents } from "./platform/events.js";
import "./app.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing Desktop renderer root.");

const bridge = globalThis.yuanceDesktop;
const auth = createDesktopAuthState(bridge?.hostState, bridge?.auth);
const apiTransport = createDesktopApiTransport(bridge?.business);
const apiClient = createApiClient({ request: apiTransport.request });
const router = createDesktopRouter();
const services = Object.freeze({
  auth,
  router,
  network: createDesktopNetworkState(bridge?.network),
  files: createDesktopFiles(bridge?.files),
  app: Object.freeze({
    api: Object.freeze({
      ...apiClient,
      logout: auth.logout,
      restorePendingReturnToHash() {},
    }),
    events: createDesktopEvents(),
    files: createReadOnlyFilePlatform(),
    router,
    runtime: Object.freeze({
      scheduleFrame: (callback) => window.requestAnimationFrame(callback),
      getElementById: (id) => document.getElementById(id),
      readFormValue: (form, name) => String(new FormData(form).get(name) || ""),
    }),
  }),
});

function createReadOnlyFilePlatform() {
  const unavailable = () => { throw new Error("Desktop attachment operations are not available in this release stage."); };
  return Object.freeze({
    selectFile: unavailable,
    files: Object.freeze({ chooseFile: unavailable, uploadSignedRequest: unavailable }),
    downloads: Object.freeze({ downloadSignedRequest: unavailable }),
    transfers: Object.freeze({ authorizeSignedRequest: unavailable }),
  });
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DesktopApp services={services} />
  </React.StrictMode>,
);
