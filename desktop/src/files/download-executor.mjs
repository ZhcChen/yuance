import { createHash } from "node:crypto";

import { decryptFile } from "./file-crypto.mjs";
import { isTrustedTransferFetch } from "../network/network-session.mjs";
import { createOperationRegistry } from "../network/operation-registry.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;

export function createDownloadExecutor({ grantVault, targetManager, fetchImpl, registry = createOperationRegistry(), timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now } = {}) {
  if (typeof grantVault?.consume !== "function" || typeof targetManager?.choose !== "function") throw new TypeError("Download executor requires grant vault and target manager");
  if (!isTrustedTransferFetch(fetchImpl)) throw new TypeError("Download executor requires trusted transfer fetch");
  if (typeof registry?.begin !== "function") throw new TypeError("Download executor requires operation registry");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS) throw new TypeError("timeoutMs exceeds the fixed safety limit");

  async function execute({ window, suggestedFilename, transferGrant, binding, signal, onCommittedTarget } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("signal is invalid");
    if (onCommittedTarget !== undefined && typeof onCommittedTarget !== "function") throw new TypeError("onCommittedTarget is invalid");
    const target = await targetManager.choose({ window, suggestedFilename });
    if (!target) return Object.freeze({ status: "cancelled" });
    const controller = new AbortController();
    const finish = registry.begin("file.download", controller);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    let response;
    let timeout;
    try {
      const contract = grantVault.consume(transferGrant, { ...binding, purpose: "download" });
      if (contract?.purpose !== "download" || contract.method !== "GET") throw downloadError("file_transfer_contract_mismatch");
      const remaining = contract.expiresAt - now();
      if (!Number.isFinite(remaining) || remaining <= 0) throw downloadError("file_transfer_grant_invalid");
      timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      if (controller.signal.aborted) throw downloadError("file_transfer_aborted");
      try {
        response = await fetchImpl(contract.url, { method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", headers: contract.headers, signal: controller.signal });
      } catch {
        throw downloadError(controller.signal.aborted ? "file_transfer_aborted" : "file_transfer_network_error");
      }
      validateResponse(response, contract);
      const byteSize = await writeResponse(response, target.handle, contract, controller.signal);
      const locator = await target.commit(byteSize);
      if (onCommittedTarget) await onCommittedTarget(locator);
      return Object.freeze({ status: "completed", byteSize, filename: target.publicFilename });
    } catch (error) {
      if (error?.code?.startsWith("file_")) throw error;
      throw downloadError(controller.signal.aborted ? "file_transfer_aborted" : "file_transfer_failed");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      controller.abort();
      finish();
      await response?.body?.cancel().catch(() => {});
      try { await target.cleanup(); } catch { throw downloadError("file_download_cleanup_failed"); }
    }
  }
  return Object.freeze({ execute });
}

async function writeResponse(response, handle, contract, signal) {
  if (contract.encryption) {
    const ciphertext = await collectCiphertext(response, contract, signal);
    const plaintext = decryptFile(
      contract.encryption.key,
      contract.encryption.fileObjectId,
      ciphertext,
    );
    const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
    if (plaintext.byteLength !== contract.encryption.plaintextByteSize || plaintextSha256 !== contract.sha256 || plaintextSha256 !== contract.encryption.plaintextSha256) throw downloadError("file_transfer_size_mismatch");
    await writeAll(handle, plaintext);
    return plaintext.byteLength;
  }
  const reader = response.body?.getReader();
  if (!reader) throw downloadError("file_transfer_response_invalid");
  const hash = createHash("sha256");
  let bytes = 0;
  while (true) {
    if (signal.aborted) throw downloadError("file_transfer_aborted");
    let result;
    try { result = await reader.read(); } catch { throw downloadError(signal.aborted ? "file_transfer_aborted" : "file_transfer_network_error"); }
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > contract.expectedBytes) throw downloadError("file_transfer_size_mismatch");
    hash.update(result.value);
    await writeAll(handle, result.value);
  }
  if (bytes !== contract.expectedBytes || hash.digest("hex") !== contract.sha256) throw downloadError("file_transfer_size_mismatch");
  return bytes;
}

async function collectCiphertext(response, contract, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw downloadError("file_transfer_response_invalid");
  const hash = createHash("sha256");
  const parts = [];
  let bytes = 0;
  while (true) {
    if (signal.aborted) throw downloadError("file_transfer_aborted");
    let result;
    try { result = await reader.read(); } catch { throw downloadError(signal.aborted ? "file_transfer_aborted" : "file_transfer_network_error"); }
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > contract.expectedBytes) throw downloadError("file_transfer_size_mismatch");
    hash.update(result.value);
    parts.push(Buffer.from(result.value));
  }
  if (
    bytes !== contract.expectedBytes ||
    hash.digest("hex") !== contract.encryption.encryptedChecksumSha256
  ) throw downloadError("file_transfer_size_mismatch");
  return Buffer.concat(parts);
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) throw downloadError("file_download_write_failed");
    offset += bytesWritten;
  }
}

function validateResponse(response, contract) {
  if (!response || response.redirected || response.status !== 200 || (response.url && response.url !== contract.url)) throw downloadError("file_transfer_response_invalid");
  if ((response.headers.get("content-type") || "").toLowerCase() !== contract.contentType.toLowerCase()) throw downloadError("file_transfer_response_invalid");
  const declared = response.headers.get("content-length");
  if (declared !== null && declared !== String(contract.expectedBytes)) throw downloadError("file_transfer_size_mismatch");
}
function downloadError(code) { return Object.assign(new Error("File download failed"), { code }); }
