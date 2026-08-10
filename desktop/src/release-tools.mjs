import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MINISIGN_VERSION = "0.12";
export const SYFT_VERSION = "1.50.0";

export async function verifyMinisignVersion(binary = "minisign") {
  const { stdout, stderr } = await run(binary, ["-v"]);
  assertMinisignVersionOutput(`${stdout}\n${stderr}`);
}

export function assertMinisignVersionOutput(output) {
  if (!new RegExp(`(?:^|\\s)minisign(?:\\s+version)?\\s+${escapeRegExp(MINISIGN_VERSION)}(?:\\s|$)`, "iu").test(output)) {
    throw new Error(`minisign ${MINISIGN_VERSION} is required.`);
  }
}

export async function verifySyftVersion(binary = "syft") {
  const { stdout } = await run(binary, ["version", "-o", "json"]);
  assertSyftVersionOutput(stdout);
}

export function assertSyftVersionOutput(output) {
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("Syft version output is invalid.");
  }
  if (value?.version !== SYFT_VERSION) throw new Error(`Syft v${SYFT_VERSION} is required.`);
}

export async function verifyMinisignSignature(messagePath, signaturePath, publicKeyPath, binary = "minisign") {
  await run(binary, ["-V", "-q", "-p", publicKeyPath, "-m", messagePath, "-x", signaturePath]);
}

export async function signWithMinisign(messagePath, signaturePath, secretKeyPath, binary = "minisign") {
  await run(binary, [
    "-S", "-s", secretKeyPath, "-m", messagePath, "-x", signaturePath,
    "-c", "Yuance Desktop internal release integrity signature",
    "-t", "channel=internal",
  ]);
}

export async function generateSyftCycloneDx(sourcePath, outputPath, binary = "syft") {
  await run(binary, ["scan", sourcePath, "-o", `cyclonedx-json=${outputPath}`], 300_000);
}

async function run(binary, args, timeout = 60_000) {
  try {
    return await execFileAsync(binary, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      timeout,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    throw new Error(`Release tool failed (${binary}, code ${code}).`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
