import { spawn } from "node:child_process";

import electron from "electron";

const serverInstanceId = option("--server-instance-id");
const endpoint = option("--endpoint");
if (!serverInstanceId) {
  process.stderr.write("Usage: npm run auth:headless -- --server-instance-id=<id> [--endpoint=<development-origin>]\n");
  process.exit(2);
}

const child = spawn(electron, [".", "--device-auth-headless", `--server-instance-id=${serverInstanceId}`], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  env: {
    ...process.env,
    YUANCE_DESKTOP_CHANNEL: "dev",
    ...(endpoint ? { YUANCE_DESKTOP_WEB_URL: endpoint } : {}),
  },
});

child.once("error", (error) => {
  process.stderr.write(`Failed to start device auth headless driver: ${error.message}\n`);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function option(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
