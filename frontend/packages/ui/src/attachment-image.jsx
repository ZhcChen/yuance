// @ts-check

import React, { useEffect, useState } from 'react';

/**
 * 统一图片显示控件：负责加载占位、就绪淡入与失败回退状态。
 *
 * @param {{
 *   src?: string,
 *   alt?: string,
 *   className?: string,
 *   fit?: 'cover' | 'contain',
 *   loading?: 'eager' | 'lazy',
 *   placeholder?: string,
 *   errorText?: string,
 *   error?: boolean,
 * }} props
 */
export function AttachmentImage({
  src = '',
  alt = '',
  className = '',
  fit = 'cover',
  loading = 'lazy',
  placeholder = '图片加载中…',
  errorText = '图片加载失败',
  error = false,
}) {
  const [state, setState] = useState(() => error ? 'error' : src ? 'loading' : 'idle');

  useEffect(() => {
    setState(error ? 'error' : src ? 'loading' : 'idle');
  }, [src, error]);

  const classes = ['yc-attachment-image', className, `is-${state}`].filter(Boolean).join(' ');
  const status = state === 'error' ? errorText : placeholder;

  return (
    <span className={classes} data-state={state}>
      {state !== 'ready' ? (
        <span className="yc-attachment-image-status" role={state === 'error' ? 'alert' : 'status'}>{status}</span>
      ) : null}
      {src && !error ? (
        <img
          className="yc-attachment-image-img"
          src={src}
          alt={alt}
          loading={loading}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
          style={{ objectFit: fit }}
        />
      ) : null}
    </span>
  );
}
