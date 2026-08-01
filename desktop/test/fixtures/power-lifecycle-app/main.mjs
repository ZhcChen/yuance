import { app, powerMonitor } from "electron";

import { bindNetworkPowerLifecycle } from "../../../src/network/power-lifecycle.mjs";

app.whenReady().then(() => {
  const calls = [];
  const coordinator = {
    suspend() { calls.push("suspend"); },
    resume() { calls.push("resume"); },
  };
  const dispose = bindNetworkPowerLifecycle({ powerEvents: powerMonitor, getCoordinator: () => coordinator });
  powerMonitor.emit("suspend");
  powerMonitor.emit("resume");
  dispose();
  powerMonitor.emit("suspend");
  process.stdout.write(`${JSON.stringify({ kind: "yuance-power-lifecycle", calls })}\n`);
  app.quit();
});
