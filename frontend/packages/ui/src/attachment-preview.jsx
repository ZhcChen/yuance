/* global requestAnimationFrame URL */
// @ts-check

import React, { useEffect, useReducer, useRef, useState } from 'react';

import { useAnimatedDialog } from './use-animated-dialog.js';

/**
 * @typedef {{
 *   scale: number,
 *   defaultScale: number,
 *   fitWidthScale: number,
 *   minScale: number,
 *   maxScale: number,
 *   rotation: number,
 *   translateX: number,
 *   translateY: number,
 *   kind: 'image' | 'video' | 'none',
 *   orientation: '' | 'portrait' | 'landscape' | 'square',
 *   viewMode: 'fit-screen' | 'fit-width' | 'manual',
 *   imageState: 'idle' | 'loading' | 'ready' | 'error',
 *   dragging: boolean,
 *   pointerId: number | null,
 *   pointerStartX: number,
 *   pointerStartY: number,
 *   pointerOriginX: number,
 *   pointerOriginY: number,
 * }} AttachmentPreviewState
 */

function createAttachmentPreviewState() {
  return {
    scale: 1,
    defaultScale: 1,
    fitWidthScale: 1,
    minScale: 1,
    maxScale: 4,
    rotation: 0,
    translateX: 0,
    translateY: 0,
    kind: 'none',
    orientation: '',
    viewMode: 'fit-screen',
    imageState: 'idle',
    dragging: false,
    pointerId: null,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerOriginX: 0,
    pointerOriginY: 0,
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeScale(value) {
  return Math.round(value * 100) / 100;
}

function mediaOrientation(width, height) {
  if (!width || !height) {
    return '';
  }
  const ratio = height / width;
  if (ratio >= 1.15) {
    return 'portrait';
  }
  if (ratio <= 0.87) {
    return 'landscape';
  }
  return 'square';
}

function fitScreenDimensions(viewportWidth, viewportHeight, naturalWidth, naturalHeight) {
  if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight, 1);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function preferredFitWidthScale(orientation, viewportWidth, renderedWidth) {
  if (orientation !== 'portrait' || !viewportWidth || !renderedWidth) {
    return 1;
  }
  const targetWidth = viewportWidth * 0.98;
  return normalizeScale(clampNumber(targetWidth / renderedWidth, 1, 4));
}

function hasFitWidthMode(state) {
  return state.kind === 'image' && state.fitWidthScale > state.defaultScale + 0.05;
}

function resolveViewMode(state, scale) {
  if (Math.abs(scale - state.defaultScale) < 0.04) {
    return 'fit-screen';
  }
  if (hasFitWidthMode(state) && Math.abs(scale - state.fitWidthScale) < 0.08) {
    return 'fit-width';
  }
  return 'manual';
}

function viewerStatusText(state, total, position, loading, error) {
  if (loading) {
    return '正在加载预览…';
  }
  if (error) {
    return error;
  }
  const prefix = total > 1 ? `第 ${position} / ${total} 项` : '';
  if (state.kind === 'video') {
    return prefix ? `${prefix} · 视频预览` : '视频预览';
  }
  if (state.kind === 'image') {
    if (state.imageState === 'error') {
      return '图片加载失败，可关闭后重新打开。';
    }
    if (state.imageState === 'idle') {
      return prefix ? `${prefix} · 正在准备媒体` : '正在准备媒体';
    }
    let hint = '适屏查看，可滚轮缩放与双击放大。';
    if (hasFitWidthMode(state)) {
      if (state.viewMode === 'fit-width') {
        hint = '适宽查看，可拖动浏览长图细节。';
      } else if (state.viewMode === 'manual') {
        hint = '已自由缩放，可切回适屏查看全图。';
      } else {
        hint = '适屏查看，双击或点击适宽查看细节。';
      }
    } else if (state.viewMode === 'manual') {
      hint = '已自由缩放，双击返回适屏。';
    }
    return prefix ? `${prefix} · ${hint}` : hint;
  }
  return prefix ? `${prefix} · 附件预览` : '附件预览';
}

function destroyDocumentController(controller) {
  if (!controller || typeof controller.destroy !== 'function') {
    return;
  }
  try {
    Promise.resolve(controller.destroy()).catch(() => {});
  } catch (_error) {
    // Destroy is best-effort when the viewer is already gone.
  }
}

function attachmentViewerErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error.message === 'string') {
    return error.message;
  }
  return '当前文件无法预览，请刷新后重试或下载原文件查看。';
}

/**
 * @param {{ open: boolean, title: string, source: string, kind: 'image' | 'video' | 'document' | null, strategy?: string | null, fileType: string | null, contentType?: string, loading?: boolean, downloading?: boolean, error?: string, position?: number, total?: number, hasPrevious?: boolean, hasNext?: boolean, onPrevious?: () => void, onNext?: () => void, onDownload: () => void, onClose: () => void, documentViewer?: (host: HTMLDivElement, input: { source: string, filename: string, previewType: string }) => Promise<{ destroy: () => unknown }>, resolveSource?: (source: string, input: { filename: string, kind: string | null, strategy: string | null, contentType: string }) => Promise<string> }} props
 */
export function AttachmentPreview({ open, title, source, kind, strategy = null, fileType, contentType = '', loading = false, downloading = false, error = '', position = 0, total = 0, hasPrevious = false, hasNext = false, onPrevious, onNext, onDownload, onClose, documentViewer, resolveSource }) {
  const dialogRef = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const stageRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const panRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const imageRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const viewerRef = useRef(/** @type {AttachmentPreviewState} */ (createAttachmentPreviewState()));
  const documentHostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const documentControllerRef = useRef(/** @type {{ destroy: () => unknown } | null} */ (null));
  const documentPreviewRequestRef = useRef(0);
  const [documentPreview, setDocumentPreview] = useState({ loading: false, error: '' });
  const [resolvedSource, setResolvedSource] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const resolvedSourceUrlRef = useRef('');
  const [, renderViewer] = useReducer((value) => value + 1, 0);

  function stageViewport(stage) {
    if (!stage) {
      return { width: 0, height: 0 };
    }
    const view = stage.ownerDocument.defaultView;
    if (!view) {
      return { width: 0, height: 0 };
    }
    const styles = view.getComputedStyle(stage);
    const paddingLeft = parseFloat(styles.paddingLeft || '0');
    const paddingRight = parseFloat(styles.paddingRight || '0');
    const paddingTop = parseFloat(styles.paddingTop || '0');
    const paddingBottom = parseFloat(styles.paddingBottom || '0');
    return {
      width: Math.max(0, stage.clientWidth - paddingLeft - paddingRight),
      height: Math.max(0, stage.clientHeight - paddingTop - paddingBottom),
    };
  }

  function renderedBounds() {
    const image = imageRef.current;
    const stage = stageRef.current;
    const state = viewerRef.current;
    if (!image || image.hidden || !stage || !image.offsetWidth || !image.offsetHeight) {
      return { maxX: 0, maxY: 0 };
    }
    const viewport = stageViewport(stage);
    const radians = (Math.abs(state.rotation % 360) * Math.PI) / 180;
    const width = image.offsetWidth * state.scale;
    const height = image.offsetHeight * state.scale;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    const rotatedWidth = width * cos + height * sin;
    const rotatedHeight = width * sin + height * cos;
    return {
      maxX: Math.max(0, (rotatedWidth - viewport.width) / 2),
      maxY: Math.max(0, (rotatedHeight - viewport.height) / 2),
    };
  }

  function canPan() {
    const state = viewerRef.current;
    if (state.kind !== 'image') {
      return false;
    }
    if (Math.abs(state.rotation % 180) > 0.01) {
      return true;
    }
    const bounds = renderedBounds();
    return bounds.maxX > 0.5 || bounds.maxY > 0.5;
  }

  function clampImageViewerTranslation() {
    const state = viewerRef.current;
    const bounds = renderedBounds();
    state.translateX = clampNumber(state.translateX, -bounds.maxX, bounds.maxX);
    state.translateY = clampNumber(state.translateY, -bounds.maxY, bounds.maxY);
    if (bounds.maxX === 0) {
      state.translateX = 0;
    }
    if (bounds.maxY === 0) {
      state.translateY = 0;
    }
  }

  function applyImageViewerTransform() {
    const state = viewerRef.current;
    const pan = panRef.current;
    const image = imageRef.current;
    if (!pan || !image) {
      return;
    }
    clampImageViewerTranslation();
    pan.style.transform = `translate3d(${state.translateX}px, ${state.translateY}px, 0)`;
    pan.dataset.draggable = canPan() ? 'true' : 'false';
    pan.classList.toggle('dragging', state.dragging && canPan());
    image.style.transform = `scale(${state.scale}) rotate(${state.rotation}deg)`;
  }

  function syncImageViewerLayout(image, forceResetScale) {
    const state = viewerRef.current;
    const stage = stageRef.current;
    const pan = panRef.current;
    if (
      !image ||
      !stage ||
      !pan ||
      image.hidden ||
      !dialogRef.current?.open ||
      state.kind !== 'image' ||
      !image.naturalWidth ||
      !image.naturalHeight
    ) {
      return;
    }
    if (!image.offsetWidth || !image.offsetHeight) {
      if (!dialogRef.current?.open) {
        return;
      }
      requestAnimationFrame(() => {
        syncImageViewerLayout(image, forceResetScale);
      });
      return;
    }
    const previousMode = state.viewMode || 'fit-screen';
    const viewport = stageViewport(stage);
    const orientation = mediaOrientation(image.naturalWidth, image.naturalHeight);
    const fitScreen = fitScreenDimensions(
      viewport.width,
      viewport.height,
      image.naturalWidth,
      image.naturalHeight
    );
    if (!fitScreen.width || !fitScreen.height) {
      return;
    }
    pan.style.width = `${fitScreen.width}px`;
    pan.style.height = `${fitScreen.height}px`;
    image.style.width = `${fitScreen.width}px`;
    image.style.height = `${fitScreen.height}px`;
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    const nextFitWidthScale = preferredFitWidthScale(
      orientation,
      viewport.width,
      fitScreen.width
    );
    state.orientation = orientation;
    state.defaultScale = 1;
    state.fitWidthScale = nextFitWidthScale;
    state.minScale = state.defaultScale;
    state.maxScale = normalizeScale(
      clampNumber(Math.max(4, nextFitWidthScale + 2), 4, 6)
    );
    if (forceResetScale || previousMode === 'fit-screen') {
      state.scale = state.defaultScale;
      state.viewMode = 'fit-screen';
      state.translateX = 0;
      state.translateY = 0;
    } else if (previousMode === 'fit-width' && hasFitWidthMode(state)) {
      state.scale = state.fitWidthScale;
      state.viewMode = 'fit-width';
      state.translateX = 0;
      state.translateY = 0;
    } else {
      state.scale = clampNumber(state.scale, state.minScale, state.maxScale);
      state.viewMode = resolveViewMode(state, state.scale);
    }
    applyImageViewerTransform();
    renderViewer();
  }

  function setImageViewerScale(nextScale) {
    const state = viewerRef.current;
    if (state.kind !== 'image') {
      return;
    }
    state.scale = normalizeScale(
      clampNumber(nextScale, state.minScale, state.maxScale)
    );
    state.viewMode = resolveViewMode(state, state.scale);
    applyImageViewerTransform();
    renderViewer();
  }

  function stopImageViewerDrag() {
    const state = viewerRef.current;
    const stage = stageRef.current;
    if (stage && state.pointerId !== null && typeof stage.releasePointerCapture === 'function') {
      try {
        stage.releasePointerCapture(state.pointerId);
      } catch (_error) {
        // Pointer capture may already be released.
      }
    }
    state.dragging = false;
    state.pointerId = null;
    const pan = panRef.current;
    if (pan) {
      pan.classList.remove('dragging');
    }
  }

  function setImageViewerPreset(mode) {
    const state = viewerRef.current;
    if (state.kind !== 'image') {
      return;
    }
    state.viewMode = mode === 'fit-width' && hasFitWidthMode(state)
      ? 'fit-width'
      : 'fit-screen';
    state.scale = state.viewMode === 'fit-width'
      ? state.fitWidthScale
      : state.defaultScale;
    state.translateX = 0;
    state.translateY = 0;
    stopImageViewerDrag();
    applyImageViewerTransform();
    renderViewer();
  }

  function resetImageViewerTransform() {
    const state = viewerRef.current;
    state.scale = state.defaultScale || 1;
    state.rotation = 0;
    state.translateX = 0;
    state.translateY = 0;
    state.viewMode = 'fit-screen';
    stopImageViewerDrag();
    applyImageViewerTransform();
    renderViewer();
  }

  function beginImageViewerDrag(event) {
    const state = viewerRef.current;
    const stage = stageRef.current;
    if (
      state.kind !== 'image' ||
      !canPan() ||
      (typeof event.button === 'number' && event.button !== 0) ||
      !stage
    ) {
      return;
    }
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.pointerOriginX = state.translateX;
    state.pointerOriginY = state.translateY;
    if (typeof stage.setPointerCapture === 'function') {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Pointer capture failures are ignored.
      }
    }
    applyImageViewerTransform();
    event.preventDefault();
  }

  function updateImageViewerDrag(event) {
    const state = viewerRef.current;
    if (!state.dragging || state.pointerId !== event.pointerId) {
      return;
    }
    state.translateX = state.pointerOriginX + (event.clientX - state.pointerStartX);
    state.translateY = state.pointerOriginY + (event.clientY - state.pointerStartY);
    applyImageViewerTransform();
    event.preventDefault();
  }

  function endImageViewerDrag(event) {
    const state = viewerRef.current;
    if (!state.dragging) {
      return;
    }
    if (event && state.pointerId !== null && event.pointerId !== state.pointerId) {
      return;
    }
    stopImageViewerDrag();
    applyImageViewerTransform();
  }

  function handleImageViewerWheel(event) {
    const state = viewerRef.current;
    if (state.kind !== 'image') {
      return;
    }
    event.preventDefault();
    setImageViewerScale(state.scale + (event.deltaY < 0 ? 0.18 : -0.18));
  }

  function handleImageViewerDoubleClick(event) {
    const state = viewerRef.current;
    if (state.kind !== 'image') {
      return;
    }
    event.preventDefault();
    if (hasFitWidthMode(state)) {
      setImageViewerPreset(state.viewMode === 'fit-screen' ? 'fit-width' : 'fit-screen');
      return;
    }
    if (Math.abs(state.scale - state.defaultScale) < 0.08) {
      setImageViewerScale(
        Math.min(
          state.maxScale,
          normalizeScale(
            Math.max(state.defaultScale * 1.45, state.defaultScale + 0.9)
          )
        )
      );
      return;
    }
    resetImageViewerTransform();
  }

  function handleImageViewerRotate() {
    const state = viewerRef.current;
    state.rotation = (state.rotation + 90) % 360;
    stopImageViewerDrag();
    applyImageViewerTransform();
    renderViewer();
  }

  function handleImageViewerLoad() {
    const state = viewerRef.current;
    const image = imageRef.current;
    if (!image) {
      return;
    }
    state.imageState = 'ready';
    state.kind = 'image';
    syncImageViewerLayout(image, true);
  }

  function handleImageViewerError() {
    const state = viewerRef.current;
    const image = imageRef.current;
    state.imageState = 'error';
    if (image) {
      image.dataset.state = 'error';
    }
    renderViewer();
  }

  useAnimatedDialog(open, dialogRef, 'attachment-preview-closing', 200);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }
    const cancel = (event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [onClose]);

  useEffect(() => {
    const state = viewerRef.current;
    const nextKind = kind === 'video' ? 'video' : kind === 'image' ? 'image' : 'none';
    Object.assign(state, createAttachmentPreviewState(), { kind: nextKind });
    const pan = panRef.current;
    const image = imageRef.current;
    if (pan) {
      pan.style.removeProperty('width');
      pan.style.removeProperty('height');
      pan.style.removeProperty('transform');
      delete pan.dataset.draggable;
      pan.classList.remove('dragging');
    }
    if (image) {
      image.style.removeProperty('width');
      image.style.removeProperty('height');
      image.style.removeProperty('max-width');
      image.style.removeProperty('max-height');
      image.style.removeProperty('transform');
    }
    renderViewer();
    const loadedImage = imageRef.current;
    if (
      loadedImage &&
      nextKind === 'image' &&
      loadedImage.naturalWidth &&
      loadedImage.naturalHeight &&
      !loadedImage.hidden
    ) {
      syncImageViewerLayout(loadedImage, true);
    }
  }, [source, kind]);

  useEffect(() => {
    let cancelled = false;
    const previousUrl = resolvedSourceUrlRef.current;
    resolvedSourceUrlRef.current = '';
    if (previousUrl && previousUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrl);
    }
    setResolvedSource('');
    setSourceLoading(false);
    setSourceError('');
    const needsResolve = Boolean(open) && Boolean(source) && typeof resolveSource === 'function'
      && (kind !== 'document' || strategy === 'text');
    if (!needsResolve) {
      setResolvedSource(source || '');
      return undefined;
    }
    setSourceLoading(true);
    resolveSource(source, {
      filename: title,
      kind,
      strategy,
      contentType,
    })
      .then((url) => {
        if (cancelled) {
          if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        resolvedSourceUrlRef.current = url || '';
        setResolvedSource(url);
        setSourceLoading(false);
      })
      .catch((resolveError) => {
        if (cancelled) return;
        setSourceError(attachmentViewerErrorMessage(resolveError));
        setSourceLoading(false);
      });
    return () => {
      cancelled = true;
      const currentUrl = resolvedSourceUrlRef.current;
      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
        resolvedSourceUrlRef.current = '';
      }
    };
  }, [open, source, kind, strategy, title, contentType, resolveSource]);

  useEffect(() => {
    const host = documentHostRef.current;
    destroyDocumentController(documentControllerRef.current);
    documentControllerRef.current = null;
    setDocumentPreview({ loading: false, error: '' });
    if (!open || kind !== 'document' || !source || !host || !documentViewer || strategy === 'text' || loading || error) {
      return undefined;
    }
    const requestId = ++documentPreviewRequestRef.current;
    setDocumentPreview({ loading: true, error: '' });
    documentViewer(host, {
      source,
      filename: title,
      previewType: fileType || strategy || '',
    })
      .then((controller) => {
        if (requestId !== documentPreviewRequestRef.current) {
          destroyDocumentController(controller);
          return;
        }
        documentControllerRef.current = controller;
        setDocumentPreview({ loading: false, error: '' });
      })
      .catch((mountError) => {
        if (requestId !== documentPreviewRequestRef.current) {
          return;
        }
        if (host) {
          host.replaceChildren();
        }
        setDocumentPreview({ loading: false, error: attachmentViewerErrorMessage(mountError) });
      });
    return () => {
      if (documentPreviewRequestRef.current === requestId) {
        documentPreviewRequestRef.current += 1;
      }
      destroyDocumentController(documentControllerRef.current);
      documentControllerRef.current = null;
    };
  }, [open, source, kind, strategy, fileType, title, loading, error, documentViewer]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    stage.addEventListener('wheel', handleImageViewerWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleImageViewerWheel);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const refresh = () => {
      const state = viewerRef.current;
      const image = imageRef.current;
      if (!image || image.hidden || state.kind !== 'image') {
        return;
      }
      syncImageViewerLayout(image, Math.abs(state.scale - state.defaultScale) < 0.01);
    };
    const view = stageRef.current?.ownerDocument.defaultView;
    if (!view) {
      return undefined;
    }
    view.addEventListener('resize', refresh);
    return () => view.removeEventListener('resize', refresh);
  }, [open]);

  const state = viewerRef.current;
  const showNavigation = total > 1;
  const displaySource = resolvedSource || source;
  const mediaReady = !sourceLoading && !sourceError && Boolean(displaySource);
  const imageControls = kind === 'image' && !loading && !error && mediaReady && state.imageState !== 'error';
  const fitToggleTarget = state.viewMode === 'fit-screen' ? 'fit-width' : 'fit-screen';
  const fitToggleLabel = state.viewMode === 'fit-screen' ? '适宽' : '适屏';
  const statusText = viewerStatusText(state, total, position, loading, error);
  const showTextPreview = kind === 'document' && strategy === 'text' && mediaReady;
  const showDocumentViewer = Boolean(documentViewer) && kind === 'document' && Boolean(source) && strategy !== 'text' && !loading && !error;

  return (
    <dialog
      ref={dialogRef}
      className="attachment-preview attachment-preview-modal"
      aria-labelledby="attachment-preview-title"
      onClose={() => {
        if (open) {
          onClose();
        }
      }}
    >
      <h2 id="attachment-preview-title" className="attachment-preview-sr-only">{title || '附件预览'}</h2>
      <p className="attachment-preview-sr-only attachment-preview-status" role="status" aria-live="polite">{statusText}</p>
      <div
        className="attachment-preview-stage"
        ref={stageRef}
        onPointerDown={beginImageViewerDrag}
        onPointerMove={updateImageViewerDrag}
        onPointerUp={endImageViewerDrag}
        onPointerCancel={endImageViewerDrag}
        onLostPointerCapture={endImageViewerDrag}
        onDoubleClick={handleImageViewerDoubleClick}
      >
        <div className={`attachment-preview-pan${showTextPreview ? ' is-text' : ''}${showDocumentViewer ? ' is-document' : ''}`} ref={panRef} key={source}>
          {!loading && !error && kind === 'image' && mediaReady ? (
            <img
              ref={imageRef}
              key={displaySource}
              className="attachment-preview-image"
              src={displaySource}
              alt={title}
              draggable={false}
              onLoad={handleImageViewerLoad}
              onError={handleImageViewerError}
            />
          ) : null}
          {!loading && !error && kind === 'video' && mediaReady ? (
            <video
              key={displaySource}
              className="attachment-preview-video"
              src={displaySource}
              controls
              playsInline
              preload="metadata"
              aria-label={title}
            />
          ) : null}
          {!loading && !error && showTextPreview ? (
            <iframe
              className="attachment-preview-text-frame"
              src={displaySource}
              title={`${title || '附件'} 文本预览`}
              sandbox=""
            />
          ) : null}
          {showDocumentViewer ? (
            <div
              ref={documentHostRef}
              className="attachment-preview-document-host"
              aria-label={`${title || '附件'} 文档预览`}
            />
          ) : null}
        </div>
        <div className="attachment-preview-overlay">
          {loading ? <p className="attachment-preview-message">正在加载预览…</p> : null}
          {!loading && error ? <p className="attachment-preview-error" role="alert">{error}</p> : null}
          {!loading && !error && sourceLoading ? <p className="attachment-preview-message">正在准备附件…</p> : null}
          {!loading && !error && sourceError ? <p className="attachment-preview-error" role="alert">{sourceError}</p> : null}
          {!loading && !error && showDocumentViewer && documentPreview.loading ? (
            <p className="attachment-preview-message">正在加载预览…</p>
          ) : null}
          {!loading && !error && showDocumentViewer && documentPreview.error ? (
            <p className="attachment-preview-error" role="alert">{documentPreview.error}</p>
          ) : null}
          {!loading && !error && kind === 'image' && state.imageState === 'error' ? (
            <p className="attachment-preview-error" role="alert">图片加载失败，可关闭后重新打开。</p>
          ) : null}
          {!loading && !error && kind === 'document' && !showTextPreview && !showDocumentViewer ? (
            <div className="attachment-preview-document">
              <strong>{fileType?.toUpperCase() || 'DOCUMENT'}</strong>
              <p>此文档暂不支持内嵌渲染，可下载后查看。</p>
            </div>
          ) : null}
          {!loading && !error && !kind ? <p className="attachment-preview-message">此文件类型不支持预览。</p> : null}
        </div>
      </div>
      <div className="attachment-preview-toolbar" role="toolbar" aria-label="媒体查看控制">
        {showNavigation ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="查看上一个媒体"
            title="上一个"
            onClick={onPrevious}
            disabled={!hasPrevious}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        ) : null}
        {imageControls ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="缩小图片"
            title="缩小"
            onClick={() => setImageViewerScale(state.scale - 0.25)}
            disabled={state.scale <= state.minScale + 0.01}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M8 11h6" /></svg>
          </button>
        ) : null}
        {imageControls ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="放大图片"
            title="放大"
            onClick={() => setImageViewerScale(state.scale + 0.25)}
            disabled={state.scale >= state.maxScale - 0.01}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></svg>
          </button>
        ) : null}
        {imageControls ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="顺时针旋转图片"
            title="顺时针旋转"
            onClick={handleImageViewerRotate}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        ) : null}
        {imageControls && hasFitWidthMode(state) ? (
          <button
            className="attachment-preview-control attachment-preview-mode-toggle"
            type="button"
            aria-label={fitToggleTarget === 'fit-width' ? '切换到适宽查看' : '切换到适屏查看'}
            title={fitToggleLabel}
            onClick={() => setImageViewerPreset(fitToggleTarget)}
          >
            <span>{fitToggleLabel}</span>
          </button>
        ) : null}
        {imageControls ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="重置图片显示"
            title="重置"
            onClick={resetImageViewerTransform}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
        ) : null}
        {showNavigation ? (
          <button
            className="attachment-preview-control"
            type="button"
            aria-label="查看下一个媒体"
            title="下一个"
            onClick={onNext}
            disabled={!hasNext}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        ) : null}
        <button
          className="attachment-preview-control"
          type="button"
          aria-label={downloading ? '正在下载附件' : '下载附件'}
          aria-busy={downloading || undefined}
          title={downloading ? '正在下载中' : '下载'}
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? <span className="attachment-preview-downloading" aria-hidden="true" /> : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>}
        </button>
        <button
          className="attachment-preview-control attachment-preview-close"
          type="button"
          aria-label="关闭媒体预览"
          title="关闭"
          onClick={onClose}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </dialog>
  );
}
