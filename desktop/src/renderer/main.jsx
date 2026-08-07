import "@yuance/frontend-ui/styles.css";
import "@yuance/frontend-app-shell/application.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { createApiClient } from "@yuance/frontend-api-client";

import DesktopApp from "./app.jsx";
import { createDesktopAuthState } from "./platform/auth-state.js";
import { createDesktopNetworkState } from "./platform/network-state.js";
import { createDesktopRouter } from "./platform/router.js";
import { createDesktopAppFiles, createDesktopFiles } from "./platform/files.js";
import { createDesktopApiTransport } from "./platform/api-transport.js";
import { createDesktopEvents } from "./platform/events.js";
import "./app.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing Desktop renderer root.");

const bridge = globalThis.yuanceDesktop;
const initialTheme = await bridge?.appearance?.getTheme().catch(() => "light") ?? "light";
document.documentElement.dataset.theme = initialTheme === "dark" ? "dark" : "light";
const auth = createDesktopAuthState(bridge?.hostState, bridge?.auth);
const apiTransport = createDesktopApiTransport(bridge?.business);
const apiClient = createApiClient({ request: apiTransport.request });
const router = createDesktopRouter();
const hostFiles = createDesktopFiles(bridge?.files);
const services = Object.freeze({
  auth,
  router,
  network: createDesktopNetworkState(bridge?.network),
  files: hostFiles,
  app: Object.freeze({
    api: Object.freeze({
      ...apiClient,
      logout: auth.logout,
      restorePendingReturnToHash() {},
    }),
    events: createDesktopEvents(bridge?.events, router),
    files: createDesktopAppFiles(bridge?.files, hostFiles),
    router,
    runtime: Object.freeze({
      scheduleFrame: (callback) => window.requestAnimationFrame(callback),
      getElementById: (id) => document.getElementById(id),
      readFormValue: (form, name) => String(new FormData(form).get(name) || ""),
      readTheme: () => initialTheme === "dark" ? "dark" : "light",
      writeTheme: (theme) => {
        document.documentElement.dataset.theme = theme;
        void bridge?.appearance?.setTheme(theme).catch(() => {});
      },
    }),
  }),
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DesktopApp services={services} />
  </React.StrictMode>,
);
