// @ts-check
/*
 * 共享图标：全部内联 SVG 描边路径。
 *
 * 不用 emoji，也不用外链图标字体或图标雪碧图，
 * 这样换肤、深浅色与离线部署都不会出现缺图或风格漂移。
 */

/** @type {Record<string, string[]>} */
export const ICON_PATHS = {
  home: ['M12 3.4 3.2 11v9.2h5.8v-6h6v6h5.8V11Z'],
  folder: ['M3.4 6.8a1.7 1.7 0 0 1 1.7-1.7h3.4l1.8 2.2h9a1.7 1.7 0 0 1 1.7 1.7v9.1a1.7 1.7 0 0 1-1.7 1.7H5.1a1.7 1.7 0 0 1-1.7-1.7Z'],
  book: ['M5.4 4.6h8.4A3.2 3.2 0 0 1 17 7.8v11.6H8.6A3.2 3.2 0 0 1 5.4 16.2Z', 'M8.8 4.6v11.6'],
  inbox: ['M4 13.2 6.8 5.6h10.4L20 13.2v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.2Z', 'M4 13.2h4.6l1.3 2.6h4.2l1.3-2.6H20'],
  task: ['M5.4 4.8h13.2v14.4H5.4Z', 'm8.6 11.9 2.2 2.2 4.6-4.7'],
  bug: ['M9.2 8.8a2.8 2.8 0 0 1 5.6 0v6.4a2.8 2.8 0 0 1-5.6 0Z', 'M4 10.6h5.2M14.8 10.6H20M4.8 15.2h4.6M14.6 15.2h4.6M12 6.2V3.4M8.2 6.8 6.6 4.8M15.8 6.8l1.6-2'],
  message: ['M4.4 6.8a1.7 1.7 0 0 1 1.7-1.7h11.8a1.7 1.7 0 0 1 1.7 1.7v8.6a1.7 1.7 0 0 1-1.7 1.7H9.4L5 20.2v-4.1a1.7 1.7 0 0 1-.6-1.3Z'],
  clock: ['M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Z', 'M12 7.4V12l3.4 2'],
  settings: ['M3.8 7.4h16.4M3.8 12h16.4M3.8 16.6h16.4', 'M8.6 5.6h2.6v3.6H8.6ZM13.4 10.2H16v3.6h-2.6ZM6.6 14.8h2.6v3.6H6.6Z'],
  download: ['M12 4.2v9.4m0 0 3.4-3.4M12 13.6 8.6 10.2M5 17.2v1.2A1.6 1.6 0 0 0 6.6 20h10.8a1.6 1.6 0 0 0 1.6-1.6v-1.2'],
  check: ['M5 12.5l4 4L19 7.5'],
  alert: ['M12 4.2 21 19.8H3Z', 'M12 10v4.2M12 17.2v.1'],
  users: ['M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M3.5 19a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M16.5 14a5 5 0 0 1 4 5'],
  refresh: ['M19.4 12a7.4 7.4 0 1 1-2.2-5.2', 'M19.6 4.4v4.2h-4.2'],
  plus: ['M12 5.4v13.2M5.4 12h13.2'],
  doc: ['M8 4.6h6l4 4v11H8Z', 'M14 4.6v4h4M10.4 12.4h5.2M10.4 15.6h5.2'],
  calendar: ['M5.6 6.4h12.8v13H5.6Z', 'M5.6 10.2h12.8M9 4.6v3.4M15 4.6v3.4'],
  external: ['M13.4 5.4h5.2v5.2M18.6 5.4 11 13', 'M17 14.4v4.2H5.6V7.2h4.2'],
};

/**
 * 渲染一个共享图标。
 *
 * @param {{
 *   name: string,
 *   className?: string,
 *   size?: number,
 * }} props
 */
export function Icon({ name, className = '', size }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
