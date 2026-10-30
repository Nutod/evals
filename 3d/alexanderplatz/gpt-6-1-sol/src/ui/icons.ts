const paths: Record<string, string> = {
  brand: '<path d="M3 19V9l6-3v13M9 19V4l6-3v18M15 19V8l6-3v14M1 20h22"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  sunset: '<path d="M3 16h18M5 20h14M7 16a5 5 0 1 1 10 0M12 2v3M3 8l2 2m14-2-2 2"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>',
  camera: '<path d="M8 5l1-2h6l1 2h4a2 2 0 0 1 2 2v12H2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  arrow: '<path d="m7 17 10-10M7 7h10v10"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2"/><path d="m18 4 1 4 4-1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9ZM2 14l10 6 10-6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  perspective: '<path d="m12 2 10 6v10l-10 5-10-5V8Zm0 11L2 8m10 5 10-5m-10 5v10m0-10V2"/>',
  map: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18m-6 0v12"/>',
  street: '<path d="m3 21 5-18h8l5 18M12 5v4m0 4v4m0 3v2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
};

export function icon(name: string, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.pin}</svg>`;
}
