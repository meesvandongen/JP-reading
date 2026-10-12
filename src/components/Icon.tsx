// Minimal inline icon set (24×24, stroke based).

const PATHS: Record<string, string> = {
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zm0 16a2 2 0 0 1 2-2h13v2',
  cards: 'M7 3h12v14H7zM4 7v14h12',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5 12 5 5',
  grammar: 'M5 4h14M5 9h10M5 14h14M5 19h8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zm7 0h3v16h-3z',
  stop: 'M6 6h12v12H6z',
  prev: 'M18 5 9 12l9 7zM6 5v14',
  next: 'M6 5l9 7-9 7zM18 5v14',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z',
  check: 'M4 12l5 5L20 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-2-4-2 1-2-1V5l-4-1-1 2h-2L8 4 4 5v2L2 8l2 4-2 1 2 4 2-1 2 1v2l4 1 1-2h2l1 2 4-1v-2l2-1z',
  text: 'M4 6h16M4 12h16M4 18h10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  volume: 'M4 9v6h4l5 4V5L8 9zm12-1a5 5 0 0 1 0 8m2-11a9 9 0 0 1 0 14',
  translate: 'M4 5h9M8 3v2m3 0c-1 5-4 8-7 9m2-5c1 2 3 4 6 5m3 7 4-10 4 10m-7-3h6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  upload: 'M12 20V9m-5 5 5-5 5 5M5 4h14',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  flame: 'M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4h4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-12v7m0-10h.01',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  brush: 'M14 4l6 6-9 9H5v-6zM4 21h6',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shuffle: 'M3 7h4l10 10h4M3 17h4l3-3m4-4 3-3h4m-3-3 3 3-3 3m0 4 3 3-3 3',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H4zm13 0h3v6h-3z',
}

export function Icon({ name, size = 22, fill = false, class: cls = '' }: { name: string; size?: number; fill?: boolean; class?: string }) {
  return (
    <svg
      class={`icon ${cls}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
