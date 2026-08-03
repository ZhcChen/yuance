import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findUnpackedExecutable } from "./smoke-app-protocol.mjs";
import { approveDeviceAuthorization } from "../test/support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "../test/support/real-api-fixture.mjs";

const CREDENTIAL_PATTERN = /Authorization|Bearer\s|yuance_(?:dat|drt|dc)_|refresh_token|access_token|device_code|csrf|cookie/iu;

export async function smokeDesktopNetwork(inputPath, { platform = process.platform } = {}) {
  await buildRealApi();
  const fixture = await startRealApiFixture();
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-packaged-network-"));
  const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification");
  await fs.mkdir(outputDirectory, { recursive: true });
  try {
    const session = await fixture.bootstrapAdmin();
    const executable = await findUnpackedExecutable(inputPath, platform);
    const authorize = await runPhase(executable, "authorize", fixture.origin, profile, platform, async (value) => {
      if (value.kind === "yuance-desktop-network-user-code") {
        await approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
      }
    });
    if (authorize.kind !== "yuance-desktop-network-authorized" || authorize.status !== "authenticated") throw new Error("packaged authorization did not complete");
    const report = await runPhase(executable, "verify", fixture.origin, profile, platform, async (value) => {
      if (value.kind === "yuance-desktop-network-user-code") {
        await approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
      }
    });
    assertDesktopNetworkSmokeReport(report, { platform });
    const outputPath = path.join(outputDirectory, "desktop-network-smoke.json");
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ executable, report, outputPath });
  } finally {
    try {
      await fixture.stop({ beforeRemove: async ({ logPath }) => {
        const log = await fs.readFile(logPath, "utf8");
        assertCredentialFreeText(log, "API fixture log");
        await fs.writeFile(path.join(outputDirectory, "desktop-network-api.log"), log, { mode: 0o600 });
      } });
    } finally {
      await fs.rm(profile, { recursive: true, force: true });
      const cleanup = Object.freeze({ kind: "yuance-desktop-network-cleanup", apiProcess: "stopped", profile: "removed" });
      await fs.writeFile(path.join(outputDirectory, "desktop-network-cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`, { mode: 0o600 });
    }
  }
}

function runPhase(executable, phase, origin, profile, platform, onReport = async () => {}) {
  return new Promise((resolve, reject) => {
    const args = [
      `--desktop-network-smoke-phase=${phase}`,
      `--desktop-network-smoke-origin=${origin}`,
      `--desktop-network-smoke-profile=${profile}`,
      ...(platform === "linux" ? ["--no-sandbox", "--password-store=gnome-libsecret"] : []),
    ];
    const child = spawn(executable, args, { cwd: path.dirname(executable), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let report; let settled = false; let sideEffect = Promise.resolve(); const reportKinds = [];
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/u);
      stdout = lines.pop() || "";
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          report = value;
          reportKinds.push(value.kind || "unknown");
          sideEffect = sideEffect.then(() => onReport(value)).catch((error) => {
            child.kill("SIGKILL");
            finish(() => reject(error));
          });
        } catch {}
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", async (code, signal) => {
      await sideEffect;
      finish(() => {
        if (code !== 0 || signal) return reject(new Error(`packaged network ${phase} failed (${signal || code}, reports=${reportKinds.join(",") || "none"}): ${stderr || stdout}`));
        if (!report) return reject(new Error(`packaged network ${phase} report is missing`));
        resolve(report);
      });
    });
  });
}

export function assertDesktopNetworkSmokeReport(report, { platform = process.platform } = {}) {
  const expectedRestart = platform === "darwin" ? "reauthorized" : "recovered";
  const expectedMessageEvidence = platform === "linux" ? "integration-fallback" : "packaged-sse";
  const expectedPackagedMessages = expectedMessageEvidence === "packaged-sse";
  if (report?.kind !== "yuance-desktop-network-smoke" || report.credentialRestart !== expectedRestart || report.messageEvidence !== expectedMessageEvidence || !report.probe || !report.firstStream || !report.rotated || !report.secondStream || !report.loggedOut || report.messageRefresh !== expectedPackagedMessages || report.releaseVersion !== expectedPackagedMessages || !report.foregroundSuppressed || !(report.revokeResponseToEofMs < 5_000) || CREDENTIAL_PATTERN.test(JSON.stringify(report))) {
    throw new Error(`packaged network smoke invariant failed: ${JSON.stringify(report)}`);
  }
  return report;
}

function assertCredentialFreeText(value, label) {
  if (CREDENTIAL_PATTERN.test(value)) throw new Error(`${label} contains credential material`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  smokeDesktopNetwork(inputPath).then(({ executable }) => console.log(`Verified desktop network smoke with ${executable}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
