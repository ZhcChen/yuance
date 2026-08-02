export function createFileStateController({ fileVault, grantVault, registry } = {}) {
  if (typeof fileVault?.invalidateAll !== "function" || typeof grantVault?.invalidateAll !== "function" || typeof registry?.abortAll !== "function") {
    throw new TypeError("file state dependencies are required");
  }
  let invalidation = Promise.resolve();

  function invalidateAll() {
    registry.abortAll();
    grantVault.invalidateAll();
    invalidation = invalidation.then(() => fileVault.invalidateAll());
    return invalidation;
  }

  return Object.freeze({ invalidateAll });
}
