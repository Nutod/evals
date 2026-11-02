import { HOURS, clamp } from "./state.js";

const paths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  wind: '<path d="M3 8h12c5 0 5-6 1-6M2 12h17c4 0 4 6 0 6M5 16h6c4 0 4 6 0 6"/>',
  dragon:
    '<path d="m3 13 3-7 6 5 6-5 3 7-7-2-2 6-2-6-7 2Z"/><path d="m12 17 2 3-3 2"/>',
  flame:
    '<path d="M12 2c1 6 6 6 6 12a6 6 0 0 1-12 0c0-3 1-4 3-6 0 4 2 4 2 4s3-5 1-10Z"/><path d="M12 14c3 3 3 6 0 7-3-1-3-4 0-7Z"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  notes: '<path d="M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4"/>',
  camera:
    '<path d="M3 7h4l2-3h6l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  mountain: '<path d="m2 20 7-12 4 6 3-11 7 17H2Z"/>',
  market:
    '<path d="M3 9 5 3h14l2 6M3 9h18v3a3 3 0 0 1-4 0 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-4 0V9Zm2 5v7h14v-7M9 3l-1 6m7-6 1 6"/>',
  bridge:
    '<path d="M2 9h20M3 9V6m6 3V6m6 3V6m6 3V6M3 20v-7h18v7M7 20a5 5 0 0 1 10 0"/>',
  gate: '<path d="M5 21V9a7 7 0 0 1 14 0v12M9 21V10a3 3 0 0 1 6 0v11M2 21h20"/>',
  aerial: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 19l9 5 9-5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.sun}</svg>`;

export function createUI(actions) {
  const root = document.querySelector("#interface");
  root.innerHTML = `
    <header class="topbar">
      <div class="location"><span class="compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 24 32"><path d="m12 2 7 25-7-6-7 6L12 2Z" fill="none" stroke="currentColor"/><path d="M12 2v19l-7 6Z" fill="currentColor"/></svg></span><div><span class="eyebrow" id="location-name">Southern slopes</span><span class="subtle">Erebor · late summer, T.A. 2770</span></div></div>
      <div class="tools"><button id="notes" class="tool" aria-pressed="false" title="Hour notes">${icon("notes")}<span>Hour notes</span></button><span class="separator"></span><button id="photo" class="tool" title="Photo mode. Press Escape to return.">${icon("camera")}<span>Photo mode</span></button></div>
    </header>
    <aside class="hour-notes" id="hour-notes" hidden><span class="eyebrow" id="note-hour"></span><p id="note-text"></p><span class="note-footer">A day under the Mountain</span></aside>
    <div class="bottom-ui">
      <div class="above-timeline">
        <nav class="views" aria-label="Camera views">${[
          ["valley", "mountain", "Valley"],
          ["market", "market", "Market"],
          ["falls", "bridge", "The falls"],
          ["gate", "gate", "Front Gate"],
          ["aerial", "aerial", "Aerial"],
        ]
          .map(
            ([id, i, label]) =>
              `<button class="view ${id === "valley" ? "selected" : ""}" data-view="${id}" aria-pressed="${id === "valley"}" title="${label} view">${icon(i)}<span>${label}</span></button>`,
          )
          .join("")}</nav>
        <div class="world-settings"><label class="density-label" for="density">Life <input id="density" aria-label="Activity density" type="range" min="0.15" max="1" step="0.05" value="1"/></label><span class="separator"></span><label class="quality-label"><span class="sr-only">Quality</span><select id="quality" aria-label="Quality"><option value="high">High detail</option><option value="medium">Balanced</option><option value="low">Light</option></select>${icon("chevron")}</label></div>
      </div>
      <section class="timeline-panel" aria-label="The passage of the day">
        <div class="timeline-heading"><div class="time-heading"><span class="live-dot"></span><output id="clock">12:00</output><span id="caption">A kingdom at its height</span></div><span class="drag-hint">Drag to move the day <span>↔</span></span></div>
        <div class="timeline-controls"><button id="play" class="play" aria-label="Play the day" aria-pressed="false">${icon("play")}</button><div class="timeline-inner"><div class="hour-stops">${HOURS.map((h, i) => `<button class="hour-stop ${i === 0 ? "active" : ""}" data-hour="${i}" aria-label="Go to ${h.name}">${icon(h.icon)}<span>${h.name}</span><i></i></button>`).join("")}</div><div class="track-wrap"><div class="timeline-track"><div id="progress"></div></div><input id="approach" type="range" min="0" max="4" step="0.001" value="0" aria-label="Passage of the day" aria-valuetext="Noon, 12:00"/></div></div></div>
      </section>
      <footer class="help"><span><span class="mouse-icon"></span> Drag to orbit <i>·</i> Scroll to explore <i>·</i> Right-drag to pan</span><span class="sound-free">A world without sound. Take your time.</span></footer>
    </div>
    <button id="exit-photo" hidden>Return to the day <kbd>Esc</kbd></button>`;
  const slider = root.querySelector("#approach"),
    play = root.querySelector("#play"),
    notes = root.querySelector("#notes");
  let noteOpen = false,
    photo = false,
    playing = false;
  slider.addEventListener("input", () => {
    setPlaying(false);
    actions.seek(Number(slider.value));
  });
  slider.addEventListener("pointerup", () => {
    const v = Number(slider.value);
    if (Math.abs(v - Math.round(v)) < 0.065) actions.seek(Math.round(v));
  });
  root.querySelectorAll("[data-hour]").forEach((button) =>
    button.addEventListener("click", () => {
      setPlaying(false);
      actions.travel(Number(button.dataset.hour));
    }),
  );
  function setPlaying(value) {
    playing = value;
    play.innerHTML = icon(value ? "pause" : "play");
    play.setAttribute("aria-label", value ? "Pause the day" : "Play the day");
    play.setAttribute("aria-pressed", String(value));
    actions.play(value);
  }
  play.addEventListener("click", () => setPlaying(!playing));
  root.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      root.querySelectorAll("[data-view]").forEach((b) => {
        const selected = b === button;
        b.classList.toggle("selected", selected);
        b.setAttribute("aria-pressed", String(selected));
      });
      root.querySelector("#location-name").textContent = {
        valley: "Southern slopes",
        market: "The market of Dale",
        falls: "The River Running",
        gate: "Before the Front Gate",
        aerial: "Above the valley",
      }[button.dataset.view];
      actions.camera(button.dataset.view);
    }),
  );
  notes.addEventListener("click", () => {
    noteOpen = !noteOpen;
    notes.setAttribute("aria-pressed", String(noteOpen));
    root.querySelector("#hour-notes").hidden = !noteOpen;
  });
  root
    .querySelector("#density")
    .addEventListener("input", (e) => actions.density(Number(e.target.value)));
  root
    .querySelector("#quality")
    .addEventListener("change", (e) => actions.quality(e.target.value));
  function setPhoto(value) {
    photo = value;
    document.body.classList.toggle("photo-mode", value);
    root.querySelector("#exit-photo").hidden = !value;
    if (value) root.querySelector("#exit-photo").focus();
    else root.querySelector("#photo").focus();
  }
  root.querySelector("#photo").addEventListener("click", () => setPhoto(true));
  root
    .querySelector("#exit-photo")
    .addEventListener("click", () => setPhoto(false));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && photo) setPhoto(false);
    if (e.code === "Space" && e.target === document.querySelector("#world")) {
      e.preventDefault();
      setPlaying(!playing);
    }
  });
  return {
    update(day) {
      slider.value = day.value;
      slider.setAttribute(
        "aria-valuetext",
        `${HOURS[day.hour].name}, ${HOURS[day.hour].time}`,
      );
      root.querySelector("#progress").style.width = `${(day.value / 4) * 100}%`;
      const hours = [12, 15, 17, 19, 23],
        a = Math.floor(day.value),
        b = Math.min(4, a + 1),
        minutes = Math.round(
          (hours[a] + (hours[b] - hours[a]) * (day.value - a)) * 60,
        );
      root.querySelector("#clock").textContent =
        `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      root.querySelector("#caption").textContent = HOURS[day.hour].caption;
      root.querySelector("#note-hour").textContent =
        `${HOURS[day.hour].time} · ${HOURS[day.hour].name}`;
      root.querySelector("#note-text").textContent = HOURS[day.hour].note;
      root.querySelectorAll("[data-hour]").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.hour) === day.hour);
        b.setAttribute(
          "aria-current",
          Number(b.dataset.hour) === day.hour ? "step" : "false",
        );
      });
      if (day.value === 4 && playing) setPlaying(false);
    },
  };
}
