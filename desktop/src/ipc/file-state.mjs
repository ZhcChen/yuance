export function createFileStateController({ fileVault, grantVault, revealVault, previewVault, registry } = {}) {
  if (typeof fileVault?.invalidateAll !== "function" || typeof grantVault?.invalidateAll !== "function" || typeof revealVault?.invalidateAll !== "function" || typeof previewVault?.invalidateAll !== "function" || typeof registry?.abortAll !== "function") {
    throw new TypeError("file state dependencies are required");
  }
  let invalidation = Promise.resolve();

  function invalidateAll() {
    registry.abortAll();
    grantVault.invalidateAll();
    revealVault.invalidateAll();
    invalidation = invalidation.then(() => Promise.all([fileVault.invalidateAll(), previewVault.invalidateAll()]));
    return invalidation;
  }

  return Object.freeze({ invalidateAll });
}
