import * as THREE from 'three';
import { LANDMARKS } from '../world/landmark-data';

export function createLabels(root: HTMLElement) {
  const labels = LANDMARKS.map((place) => {
    const element = document.createElement('button');
    element.className = 'map-label';
    element.dataset.landmark = place.id;
    element.setAttribute('aria-label', `Explore ${place.name}`);
    element.innerHTML = `<span>${place.id === 'station' ? 'Alexanderplatz Bahnhof' : place.name}</span>`;
    root.append(element);
    return {
      element,
      place,
      position: new THREE.Vector3(place.position[0], place.height + 8, place.position[1]),
    };
  });
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let layoutKey = '';
  let blockers: DOMRect[] = [];

  function update(camera: THREE.PerspectiveCamera, visible: boolean, selected: string | null) {
    camera.getWorldDirection(direction);
    const width = window.innerWidth,
      height = window.innerHeight;
    const toast = document.querySelector<HTMLElement>('#toast')!;
    const nextLayoutKey = `${width}:${height}:${selected}:${document.querySelector<HTMLDetailsElement>('.layers-panel')!.open}:${toast.classList.contains('visible')}:${toast.textContent}`;
    if (layoutKey !== nextLayoutKey) {
      blockers = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.topbar, .place-panel, .scene-controls, .layers-panel, #detail-card, .view-toolbar, .orientation, #toast, footer',
        ),
      )
        .filter(
          (element) =>
            element.getClientRects().length > 0 &&
            (element.id !== 'toast' || element.classList.contains('visible')),
        )
        .map((element) => element.getBoundingClientRect());
      layoutKey = nextLayoutKey;
    }
    const selectedPlace = LANDMARKS.find((p) => p.id === selected);
    const closeUp =
      selectedPlace &&
      camera.position.distanceTo(
        new THREE.Vector3(selectedPlace.position[0], selectedPlace.targetHeight, selectedPlace.position[1]),
      ) < 220;
    for (const { element, place, position } of labels) {
      position.y = place.height + (selected === place.id ? 1 : 8);
      point.copy(position).sub(camera.position);
      if (!visible || point.dot(direction) <= 0 || (closeUp && place.id !== selected)) {
        element.hidden = true;
        continue;
      }
      point.copy(position).project(camera);
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      const labelWidth = Math.max(150, place.name.length * 8 + 44);
      const isCovered = blockers.some(
        (rect) =>
          x - 6 < rect.right + 8 &&
          x + labelWidth > rect.left - 8 &&
          y - 20 < rect.bottom + 8 &&
          y + 20 > rect.top - 8,
      );
      element.hidden =
        point.z < -1 || point.z > 1 || x < 16 || x > width - 120 || y < 80 || y > height - 140 || isCovered;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      element.classList.toggle('is-selected', selected === place.id);
    }
  }
  return { update };
}
