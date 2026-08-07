// @ts-check

/**
 * @param {{ api: any, platform: any, releaseId: number, platformName: string, architecture: string, artifactKind: string, file: any, lifecycle: any }} options
 */
export async function uploadSystemReleaseAsset({ api, platform, releaseId, platformName, architecture, artifactKind, file, lifecycle }) {
  if (!lifecycle.isCurrent()) return { completed: false, created: null, uploaded: null, refreshError: null };
  const delegated = platform.releaseAssets?.uploadSystemReleaseAsset;
  if (typeof delegated === 'function') {
    return delegatedUpload({
      execute: (onStage) => delegated({ releaseId, platform: platformName, architecture, artifactKind, fileCapability: file.capability }, onStage),
      lifecycle,
    });
  }
  lifecycle.onStage('registering');
  const created = await api.createSystemReleaseAsset(releaseId, {
    platform: platformName, architecture, artifactKind, originalFilename: file.filename,
    contentType: file.contentType, byteSize: file.byteSize, checksumSha256: file.checksumSha256 || '',
  });
  if (!lifecycle.isCurrent()) return { completed: false, created, uploaded: null, refreshError: null };
  lifecycle.onCreated(created);
  lifecycle.onStage('signing');
  const signed = await api.getSystemReleaseAssetUploadUrl(releaseId, created.id);
  if (!lifecycle.isCurrent()) return { completed: false, created, uploaded: null, refreshError: null };
  const transfer = platform.transfers.authorizeSignedRequest({ request: signed.request, purpose: 'upload', expiresInSeconds: signed.expires_in_seconds });
  lifecycle.onStage('uploading');
  await platform.files.uploadSignedRequest(transfer, file.capability);
  const currentBeforeConfirm = lifecycle.isCurrent();
  if (currentBeforeConfirm) lifecycle.onStage('confirming');
  const uploaded = await api.markSystemReleaseAssetUploaded(releaseId, created.id);
  if (!currentBeforeConfirm || !lifecycle.isCurrent()) return { completed: false, created, uploaded, refreshError: null };
  lifecycle.onUploaded(uploaded);
  return finishRefresh({ created, uploaded, lifecycle });
}

/** @param {{ api: any, platform: any, releaseId: number, assetId: number, suggestedFilename: string, isCurrent: () => boolean }} options */
export async function downloadSystemReleaseAsset({ api, platform, releaseId, assetId, suggestedFilename, isCurrent }) {
  if (!isCurrent()) return { status: 'cancelled' };
  if (typeof platform.releaseAssets?.downloadSystemReleaseAsset === 'function') {
    return platform.releaseAssets.downloadSystemReleaseAsset({ releaseId, assetId, suggestedFilename });
  }
  const signed = await api.getSystemReleaseAssetDownloadUrl(releaseId, assetId);
  if (!isCurrent()) return { status: 'cancelled' };
  const transfer = platform.transfers.authorizeSignedRequest({ request: signed.request, purpose: 'download', expiresInSeconds: signed.expires_in_seconds });
  await platform.downloads.downloadSignedRequest(transfer, suggestedFilename);
  return { status: 'completed' };
}

async function delegatedUpload({ execute, lifecycle }) {
  let createdPublished = false;
  const result = await execute((stage, created) => {
    if (!lifecycle.isCurrent()) return;
    lifecycle.onStage(stage);
    if (created && !createdPublished) { createdPublished = true; lifecycle.onCreated(created); }
  });
  if (!lifecycle.isCurrent()) return { completed: false, created: result.created, uploaded: result.uploaded, refreshError: null };
  if (!createdPublished) lifecycle.onCreated(result.created);
  lifecycle.onUploaded(result.uploaded);
  return finishRefresh({ ...result, lifecycle });
}

async function finishRefresh({ created, uploaded, lifecycle }) {
  let refreshError = null;
  try { await lifecycle.refresh?.(); } catch (error) { refreshError = error; }
  return { completed: lifecycle.isCurrent(), created, uploaded, refreshError };
}
