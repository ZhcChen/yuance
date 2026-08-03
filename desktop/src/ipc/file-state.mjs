export function createFileStateController({ fileVault, grantVault, revealVault, registry } = {}) {
  if (typeof fileVault?.invalidateAll !== "function" || typeof grantVault?.invalidateAll !== "function" || typeof revealVault?.invalidateAll !== "function" || typeof registry?.abortAll !== "function") {
    throw new TypeError("file state dependencies are required");
  }
  let invalidation = Promise.resolve();

  function invalidateAll() {
    registry.abortAll();
    grantVault.invalidateAll();
    revealVault.invalidateAll();
    invalidation = invalidation.then(() => fileVault.invalidateAll());
    return invalidation;
  }

  return Object.freeze({ invalidateAll });
}
