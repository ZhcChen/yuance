import { createHash } from "node:crypto";

import { openRegularFile, sameFileIdentity } from "./file-identity.mjs";
import {
  createEncryptionHeader,
  encryptBodyChunk,
  encryptedTotalSize,
} from "./file-crypto.mjs";
import { isTrustedTransferFetch } from "../network/network-session.mjs";
import { createOperationRegistry } from "../network/operation-registry.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;

export function createUploadExecutor({
  fileVault,
  grantVault,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  openSnapshot = openRegularFile,
  platform = process.platform,
  windowsGuard,
  spoolRoot,
  now = Date.now,
  registry = createOperationRegistry(),
} = {}) {
  if (typeof fileVault?.consume !== "function" || typeof grantVault?.consume !== "function") throw new TypeError("Upload executor requires capability vaults");
  if (!isTrustedTransferFetch(fetchImpl)) throw new TypeError("Upload executor requires trusted transfer fetch");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS) throw new TypeError("timeoutMs exceeds the fixed safety limit");
  if (typeof openSnapshot !== "function") throw new TypeError("openSnapshot is required");
  if (platform === "win32" && (typeof windowsGuard?.openSnapshot !== "function" || typeof spoolRoot !== "string")) throw new TypeError("Windows upload requires native snapshot guard");
  if (typeof registry?.begin !== "function") throw new TypeError("Upload executor requires operation registry");
  const openSnapshotHandle = platform === "win32"
    ? ({ filePath }) => windowsGuard.openSnapshot({ spoolRoot, privatePath: filePath })
    : openSnapshot;

  async function execute({ fileCapability, transferGrant, binding, signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("signal is invalid");
    let snapshot;
    let opened;
    let response;
    let timeout;
    const controller = new AbortController();
    const finishOperation = registry.begin("file.upload", controller);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      snapshot = fileVault.consume(fileCapability, { ...binding, purpose: "upload" });
      const contract = grantVault.consume(transferGrant, { ...binding, purpose: "upload" });
      validatePair(snapshot, contract);
      const remainingGrantMs = contract.expiresAt - now();
      if (!Number.isFinite(remainingGrantMs) || remainingGrantMs <= 0) throw uploadError("file_transfer_grant_invalid");
      timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remainingGrantMs));
      if (controller.signal.aborted) throw uploadError("file_transfer_aborted");
      opened = await openSnapshotHandle({ filePath: snapshot.privatePath });
      await verifySnapshot(opened, snapshot, contract, controller.signal);
      const encryption = contract.encryption || null;
      const uploadState = {
        offset: 0,
        sourceOffset: 0,
        hash: createHash("sha256"),
        plaintextHash: createHash("sha256"),
      };
      const body = streamHandle(
        opened.handle,
        contract.expectedBytes,
        uploadState,
        controller.signal,
        encryption,
      );
      try {
        response = await fetchImpl(contract.url, {
          method: "PUT",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: contract.headers,
          body,
          duplex: "half",
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.code?.startsWith("file_transfer_")) throw error;
        throw uploadError(controller.signal.aborted ? "file_transfer_aborted" : "file_transfer_network_error");
      }
      if (uploadState.offset !== contract.expectedBytes) throw uploadError("file_transfer_source_changed");
      const ciphertextSha256 = uploadState.hash.digest("hex");
      if (encryption) {
        if (uploadState.plaintextHash.digest("hex") !== contract.sha256) throw uploadError("file_transfer_source_changed");
      } else if (ciphertextSha256 !== contract.sha256) {
        throw uploadError("file_transfer_source_changed");
      }
      const finalIdentity = await opened.currentIdentity();
      if (!sameFileIdentity(opened.identity, finalIdentity)) throw uploadError("file_transfer_source_changed");
      validateResponse(response, contract);
      await response.body?.cancel().catch(() => {});
      return Object.freeze({
        status: "completed",
        byteSize: encryption ? encryption.plaintextByteSize : contract.expectedBytes,
        ...(encryption ? { encryptedChecksumSha256: ciphertextSha256 } : {}),
      });
    } catch (error) {
      if (error?.code?.startsWith("file_transfer_")) throw error;
      throw uploadError(controller.signal.aborted ? "file_transfer_aborted" : "file_transfer_failed");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      controller.abort();
      finishOperation();
      await response?.body?.cancel().catch(() => {});
      await opened?.handle.close().catch(() => {});
      if (snapshot) {
        try { await snapshot.remove(); } catch { throw uploadError("file_snapshot_cleanup_failed"); }
      }
    }
  }

  return Object.freeze({ execute });
}

async function verifySnapshot(opened, snapshot, contract, signal) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  const snapshotSize = contract.encryption ? contract.encryption.plaintextByteSize : contract.expectedBytes;
  while (offset < snapshotSize) {
    if (signal.aborted) throw uploadError("file_transfer_aborted");
    const length = Math.min(buffer.length, snapshotSize - offset);
    const { bytesRead } = await opened.handle.read(buffer, 0, length, offset);
    if (bytesRead === 0) throw uploadError("file_transfer_source_changed");
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  const extra = await opened.handle.read(buffer, 0, 1, offset);
  const expectedSha256 = contract.encryption ? contract.encryption.plaintextSha256 : contract.sha256;
  if (extra.bytesRead !== 0 || hash.digest("hex") !== expectedSha256 || !sameFileIdentity(opened.identity, await opened.currentIdentity())) throw uploadError("file_transfer_source_changed");
}

function streamHandle(handle, expectedBytes, state, signal, encryption) {
  const sourceSize = encryption ? encryption.plaintextByteSize : expectedBytes;
  const header = encryption
    ? createEncryptionHeader(encryption.plaintextByteSize, encryption.plaintextSha256)
    : null;
  const chunkCount = encryption
    ? Math.ceil(encryption.plaintextByteSize / encryption.chunkSize)
    : 0;
  const noncesOffset = header ? header.length - chunkCount * 12 : 0;
  let chunkIndex = 0;
  let headerSent = false;
  let pending = Buffer.alloc(0);
  return new ReadableStream({
    async pull(controller) {
      if (signal.aborted) return controller.error(uploadError("file_transfer_aborted"));
      if (encryption && !headerSent) {
        state.hash.update(header);
        state.offset += header.length;
        headerSent = true;
        controller.enqueue(header);
        if (chunkCount === 0) return controller.close();
        return;
      }
      if (state.offset === expectedBytes) return controller.close();
      if (!encryption) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, sourceSize - state.sourceOffset));
        try {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.sourceOffset);
          if (bytesRead === 0) return controller.error(uploadError("file_transfer_source_changed"));
          const chunk = buffer.subarray(0, bytesRead);
          state.offset += bytesRead;
          state.sourceOffset += bytesRead;
          state.hash.update(chunk);
          controller.enqueue(chunk);
        } catch {
          controller.error(uploadError(signal.aborted ? "file_transfer_aborted" : "file_transfer_source_changed"));
        }
        return;
      }
      try {
        while (pending.length < encryption.chunkSize && state.sourceOffset < sourceSize) {
          const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, sourceSize - state.sourceOffset));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.sourceOffset);
          if (bytesRead === 0) throw uploadError("file_transfer_source_changed");
          const chunk = buffer.subarray(0, bytesRead);
          pending = Buffer.concat([pending, chunk]);
          state.sourceOffset += bytesRead;
          state.plaintextHash.update(chunk);
        }
        if (pending.length >= encryption.chunkSize || (state.sourceOffset >= sourceSize && pending.length > 0)) {
          const chunk = pending.subarray(0, Math.min(encryption.chunkSize, pending.length));
          pending = pending.subarray(chunk.length);
          const nonce = header.subarray(
            noncesOffset + chunkIndex * 12,
            noncesOffset + (chunkIndex + 1) * 12,
          );
          const encrypted = encryptBodyChunk(
            encryption.key,
            encryption.fileObjectId,
            chunkIndex,
            nonce,
            chunk,
          );
          state.offset += encrypted.length;
          state.hash.update(encrypted);
          chunkIndex += 1;
          controller.enqueue(encrypted);
          return;
        }
        if (state.sourceOffset >= sourceSize && pending.length === 0) {
          if (state.offset === expectedBytes) return controller.close();
          throw uploadError("file_transfer_source_changed");
        }
      } catch {
        controller.error(uploadError(signal.aborted ? "file_transfer_aborted" : "file_transfer_source_changed"));
      }
    },
  });
}

function validatePair(snapshot, contract) {
  if (!snapshot || contract?.purpose !== "upload" || contract.method !== "PUT") throw uploadError("file_transfer_contract_mismatch");
  if (contract.encryption) {
    const expectedBytes = encryptedTotalSize(contract.encryption.plaintextByteSize);
    if (
      snapshot.byteSize !== contract.encryption.plaintextByteSize ||
      snapshot.sha256 !== contract.encryption.plaintextSha256 ||
      snapshot.sha256 !== contract.sha256 ||
      contract.expectedBytes !== expectedBytes ||
      contract.contentType !== "application/octet-stream"
    ) throw uploadError("file_transfer_contract_mismatch");
    return;
  }
  if (snapshot.byteSize !== contract.expectedBytes || snapshot.sha256 !== contract.sha256 || snapshot.contentType !== contract.contentType) throw uploadError("file_transfer_contract_mismatch");
}

function validateResponse(response, contract) {
  if (!response || response.redirected || (response.status >= 300 && response.status < 400) || ![200, 201, 204].includes(response.status)) throw uploadError("file_transfer_response_invalid");
  if (response.url && response.url !== contract.url) throw uploadError("file_transfer_response_invalid");
}

function uploadError(code) { return Object.assign(new Error("File upload failed"), { code }); }
