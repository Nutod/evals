const paths = {
  layers: '<path d="m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="4.6" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="4.5"/>',
  plan: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2z M9 3v15 M15 6v15"/>',
  street: '<circle cx="13" cy="4" r="2"/><path d="m8 21 3-6 3 2 2 4 M12 9l-3 5-4 1 M17 13l-3-2-1-4-3 1"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5m0-9v.1"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  reset: '<path d="M4 9a8 8 0 1 1 0 7 M4 3v6h6"/>',
  plus: '<path d="M12 5v14 M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path fill="currentColor" stroke="none" d="m7 3 13 9-13 9z"/>',
  pause: '<path fill="currentColor" stroke="none" d="M6 4h4v16H6zm8 0h4v16h-4z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
};
export const icon = (name: keyof typeof paths, size = 18) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;

// Small orthographic elevations use a common drawing coordinate system.
const elevations = [
  '<path d="m16.8 31 1-16.4m2.4 16.4-1.1-16.4m-.9-9.4V.6m-1 6.8h2m-2.6 1.8h3.4M11 32l4-2h7l4 2"/><circle cx="18.4" cy="12" r="3.8"/><path d="M15 12.9h6.8M16 14.2h4.8m-2.5 2.2V30"/>',
  '<path d="M6 32V9l16-3.2L29 9v23M6 9l16-3v26M8 12l12-2.2m-12 5.7 12-2.1m-12 5.8 12-2m-12 5.5 12-1.6m-12 5.3 12-1.2m-12 4.8 12-.9M24 10v19m2-18v19M16 6V4h3v2"/>',
  '<path d="m7 16 11-3 12 3-1 6-11 3-10-3z M7 16l11 3 12-3M18 19v6m-3-7v6m8-6v5m-6 2-1 6m3-6 1 6M10 32q8-3 16 0M18 13V7"/><ellipse cx="18" cy="7.5" rx="7" ry="2.4" transform="rotate(-18 18 7.5)"/><circle cx="18" cy="7.5" r="1.4"/>',
  '<path d="M3 32V17q7-13 14-4l16 3v14l-17 2z M3 17q7-11 13 0v15M5 17v5h9v-5q-4-6-9 0zm14 0v7l11-1v-5zM3 26h13m3 1 11-1M7 32v-5m5 5v-5"/>',
  '<path d="M3 32V22l10-1V12l3-1V7l3-2 3 2v4l2 1v9l9 2v9zM12 12h13m-12 7h11m-6-14V2m-3 22v6m5-6v6m-13-6v5m3-5v5m17-5v5m3-5v5"/><circle cx="18.5" cy="15.4" r="2.1"/>',
  '<path d="M4 32V19l2-1 1-4 3-2-2-2 3-7 2 7-1 2 2 2 1 6v12m0-12 8-3 9 6v9z M4 21h11M7 27v-3q1.4-3 2.8 0v3m8-3v5m4-6v6m4-5v5m4-4v4M11 4V.8"/>',
];
export const elevation = (i: number) =>
  `<svg viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round">${elevations[i]}</svg>`;

export const logo = `<svg width="33" height="33" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect width="36" height="36" rx="7" fill="#E7C65B"/><g stroke="#24382d" stroke-width="1.65" stroke-linejoin="round"><path d="m5.7 15.5 12-7 12.5 7-12.5 7z"/><path d="m6 20.1 11.7 6.6 12.2-6.6M6 24.4l11.7 6.5 12.2-6.5M12.4 11.8l11.9 7M10.9 18.3l12-6.8"/></g></svg>`;

export const skyline = `<svg viewBox="0 0 290 77" preserveAspectRatio="none" aria-hidden="true">
  <defs><pattern id="mesh" width="15" height="12" patternUnits="userSpaceOnUse"><path d="M15 0H0v12" fill="none" stroke="#90a697" stroke-opacity=".16" stroke-width=".6"/></pattern>
  <linearGradient id="sil" x2="0" y2="1"><stop stop-color="#698071"/><stop offset="1" stop-color="#334e40"/></linearGradient></defs>
  <rect width="290" height="77" fill="url(#mesh)"/>
  <g fill="#30473b" stroke="#738875" stroke-width=".65"><path d="M0 69v-8h11v-6h8v5h13v-10h20v11h11v-7h20v8h16v-7h12v8h12v-5h12v-7h21v9h19v-4h15v-9h15v12h13v-6h17v-3h20v12h31v12H0z"/></g>
  <g fill="url(#sil)" stroke="#a1ad96" stroke-width=".8">
  <path d="M17 69V58l9-6 9 6h5v11zm23 0V58l3-3 2-7 2-3 1-8 1 8 3 5-1 3 3 5v11z"/>
  <path d="m61 69 6-3h7l1.5-33h2L79 66h6l5 3z"/><ellipse cx="76.4" cy="29.2" rx="5.1" ry="4.7"/><path d="M71.6 30.3h9.4m-7-5.6v-3.2h4.4v3.2M76.4 21.4V2"/>
  <path d="M105 69V59q10-14 22 0l31 2v8zM127 59v10"/><path d="M177 69V31l15-2 6 2v38zM192 29v40"/><path d="M206 69v-9h8v-6h9v6h6v9zm32 0v-12h10v-9l3-2v-5l4-2 4 2v5l3 2v9h11v12z"/>
  </g><g stroke="#91a08c" stroke-width=".55"><path d="M179 34h11m-11 4h11m-11 4h11m-11 4h11m-11 4h11m-11 4h11m-11 4h11m-11 4h11m-11 4h11M0 69h290"/></g>
  <g stroke="#d6b962" fill="none" stroke-width=".6" stroke-dasharray="2 2"><path d="M79 4h31"/></g><text x="114" y="7" fill="#a9b5a5" font-family="monospace" font-size="6">368 m</text></svg>`;

export function lightArt(i: number) {
  const [sky, back, front, sun] = [
    ['#98bcc8', '#7e9c99', '#4f7063', '#fff3bf'],
    ['#dca078', '#aa8067', '#745c50', '#ffe6a7'],
    ['#737f9d', '#505e74', '#384656', '#e4e5cf'],
  ][i];
  return `<svg viewBox="0 0 94 34" preserveAspectRatio="none" aria-hidden="true"><rect width="94" height="34" fill="${sky}"/><circle cx="${i === 1 ? 62 : 68}" cy="${i === 1 ? 19 : 10}" r="${i === 2 ? 3 : 5}" fill="${sun}"/><path d="M0 25h7v-6h8v3h9v-5h7v3h8v4h10v-5h11v2h9v-5h12v8h13v10H0z" fill="${back}"/><path d="M0 28h11v-4h6v4h7l1-11h1l1 11h4v-4h7v2h13v3h8v-5h8v3h7v-5h10v4h10v8H0z" fill="${front}"/><circle cx="25.5" cy="16" r="2.6" fill="${front}"/><path d="M25.5 14V7" stroke="${front}" stroke-width=".8"/></svg>`;
}
