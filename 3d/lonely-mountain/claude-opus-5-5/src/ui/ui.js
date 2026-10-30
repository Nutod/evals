// The approach slider and the compact secondary controls.
import { HOURS, hourIndex } from '../core/hours.js';
import { clamp } from '../core/util.js';

const ICONS = [
  '<circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7"/>',
  '<path d="M2 7.5h9.5a2.5 2.5 0 1 0-2.4-3.2M2 11h13a2.6 2.6 0 1 1-2.5 3.3M2 14.5h6"/>',
  '<path d="M10 9.5c-2-3-5-4.6-8.4-4.4 1.2 1 1.5 2.3 1.2 3.4 1.2-.4 2.4 0 3 1-.9.2-1.4 1-1.4 1.8 1.5-.7 3.5-.6 5.6-1.8 2.1 1.2 4.1 1.1 5.6 1.8 0-.8-.5-1.6-1.4-1.8.6-1 1.8-1.4 3-1 -.3-1.1 0-2.4 1.2-3.4-3.4-.2-6.4 1.4-8.4 4.4z"/>',
  '<path d="M10 18c3.3 0 5.6-2.3 5.6-5.4 0-3.6-3.2-5.4-3.9-9.6-1.9 1.4-2.7 3.4-2.6 5.4-1.1-.7-1.6-1.9-1.6-3.1C5.6 7 4.4 9.7 4.4 12.6 4.4 15.7 6.7 18 10 18z"/><path d="M10 18c-1.5 0-2.5-1-2.5-2.5 0-1.6 1.2-2.4 2.3-4 .9 1.5 2.7 2.4 2.7 4 0 1.5-1 2.5-2.5 2.5z"/>',
  '<path d="M7.2 4.5h5.6M8 4.5V3h4v1.5M6.5 6h7l-.7 9H7.2z M10 8.3c.9 1 1.3 1.8 1.3 2.6a1.3 1.3 0 0 1-2.6 0c0-.8.4-1.6 1.3-2.6zM7.5 17h5"/>',
];
const CLOCK = [720, 920, 1060, 1190, 1410];

export function clockAt(t) {
  t = clamp(t, 0, 4);
  const i = Math.min(3, Math.floor(t));
  const m = CLOCK[i] + (CLOCK[i + 1] - CLOCK[i]) * (t - i);
  const hh = Math.floor(m / 60) % 24;
  const mm = Math.floor(m % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function bindUI(app) {
  const $ = (id) => document.getElementById(id);
  const track = $('track'), handle = $('handle'), fill = $('track-fill'), stops = $('stops');
  const timeline = $('timeline');

  HOURS.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = 'stop';
    li.style.left = `${(i / 4) * 100}%`;
    li.innerHTML = `<button type="button" data-hour="${i}" aria-label="Go to ${h.label}, ${h.clock}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i]}</svg><span>${h.label}</span></button>`;
    stops.appendChild(li);
  });
  stops.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-hour]');
    if (b) app.goToHour(Number(b.dataset.hour));
  });

  const tFromX = (clientX) => {
    const r = track.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width) * 4;
  };
  let dragging = false;
  const onMove = (e) => {
    if (dragging) app.setHour(tFromX(e.clientX));
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    timeline.classList.remove('hint');
    track.setPointerCapture(e.pointerId);
    app.setHour(tFromX(e.clientX));
  });
  track.addEventListener('pointermove', onMove);
  const release = () => {
    if (!dragging) return;
    dragging = false;
    // Snap to an hour label when released close to it; otherwise stay between hours.
    const t = app.hour();
    const near = Math.round(t);
    if (Math.abs(t - near) < 0.07) app.goToHour(near, 0.5);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  handle.addEventListener('keydown', (e) => {
    const t = app.hour();
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') app.setHour(t + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') app.setHour(t - step);
    else if (e.key === 'PageUp' || e.key === 'End') app.goToHour(e.key === 'End' ? 4 : Math.min(4, Math.floor(t + 1e-3) + 1));
    else if (e.key === 'PageDown' || e.key === 'Home') app.goToHour(e.key === 'Home' ? 0 : Math.max(0, Math.ceil(t - 1e-3) - 1));
    else return;
    e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (/^[1-5]$/.test(e.key)) app.goToHour(Number(e.key) - 1);
    else if (e.key === 'p' || e.key === 'P') togglePhoto();
    else if (e.key === 'Escape' && document.body.classList.contains('photo')) togglePhoto(false);
  });

  // Dock.
  const views = $('views');
  views.addEventListener('change', () => app.rig.flyTo(views.value));
  app.rig.onPreset = (name) => {
    views.value = name || 'free';
  };
  const density = $('density');
  density.addEventListener('input', () => app.setDensity(Number(density.value)));
  const quality = $('quality');
  quality.value = app.quality;
  quality.addEventListener('change', () => app.setQuality(quality.value));

  const notesToggle = $('notes-toggle'), notes = $('notes');
  let notesOn = false;
  notesToggle.addEventListener('click', () => {
    notesOn = !notesOn;
    notesToggle.setAttribute('aria-pressed', String(notesOn));
    notes.hidden = !notesOn;
    lastNote = -1;
  });

  const togglePhoto = (on = !document.body.classList.contains('photo')) => {
    document.body.classList.toggle('photo', on);
    $('photo-bar').hidden = !on;
  };
  $('photo').addEventListener('click', () => togglePhoto(true));
  $('photo-exit').addEventListener('click', () => togglePhoto(false));
  $('photo-save').addEventListener('click', async () => {
    const blob = await app.exportPNG();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dale-${HOURS[hourIndex(app.hour())].key}-${clockAt(app.hour()).replace(':', '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // Hour notes and vignette markers.
  const markers = $('markers');
  const places = $('notes-places');
  let lastNote = -1;
  const markerEls = [];
  const renderNotes = (i) => {
    $('notes-title').textContent = `${HOURS[i].label} · ${HOURS[i].clock}`;
    $('notes-body').textContent = HOURS[i].note;
    places.innerHTML = '';
    markers.innerHTML = '';
    markerEls.length = 0;
    for (const v of app.vignettes(i)) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = v.label;
      b.addEventListener('click', () => app.flyToVignette(v));
      li.appendChild(b);
      places.appendChild(li);
      const m = document.createElement('div');
      m.className = 'marker';
      m.textContent = v.label;
      markers.appendChild(m);
      markerEls.push({ el: m, v });
    }
  };

  timeline.classList.add('hint');
  let lastT = -1;
  return function updateUI() {
    const t = app.hour();
    if (t !== lastT) {
      lastT = t;
      const pct = (t / 4) * 100;
      handle.style.left = `${pct}%`;
      fill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      const i = hourIndex(t);
      $('readout-hour').textContent = Math.abs(t - i) < 0.02 ? HOURS[i].label : `${HOURS[Math.floor(t)].label} → ${HOURS[Math.min(4, Math.floor(t) + 1)].label}`;
      $('readout-clock').textContent = clockAt(t);
      handle.setAttribute('aria-valuenow', t.toFixed(2));
      handle.setAttribute('aria-valuetext', `${HOURS[i].label}, ${clockAt(t)}`);
      stops.querySelectorAll('.stop').forEach((li, k) => {
        li.classList.toggle('passed', k <= t + 1e-3);
        li.querySelector('button').setAttribute('aria-current', String(k === i));
      });
    }
    if (notesOn) {
      const i = hourIndex(t);
      if (i !== lastNote) {
        lastNote = i;
        renderNotes(i);
      }
      for (const { el, v } of markerEls) {
        const s = app.project(v.focus);
        el.style.display = s ? '' : 'none';
        if (s) el.style.transform = `translate(${s.x}px, ${s.y - 14}px) translate(-50%, -100%)`;
      }
    } else if (markers.childElementCount) {
      markers.innerHTML = '';
      markerEls.length = 0;
    }
  };
}
